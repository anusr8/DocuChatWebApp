import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getMultimodalEmbedding, generativeModel } from '@/lib/vertex';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const image = formData.get('image') as File | null;

        if (!image) {
            return NextResponse.json({ error: 'Image is required' }, { status: 400 });
        }

        const startTime = Date.now();
        console.log(`[VisualSearch] Received image: ${image.name} (${image.size} bytes)`);

        // 1. Upload temporary image to GCS for embedding generation
        const bucket = adminStorage.bucket();
        const tempPath = `temp-searches/${Date.now()}-${image.name}`;
        const fileRef = bucket.file(tempPath);
        
        const buffer = Buffer.from(await image.arrayBuffer());
        await fileRef.save(buffer, {
            metadata: { contentType: image.type || 'image/jpeg' }
        });

        const gsUri = `gs://${bucket.name}/${tempPath}`;
        console.log('[VisualSearch] Temp image uploaded to:', gsUri);
 
        // 2. Use Gemini to describe the search screenshot (Visual Context)
        const transcribePrompt = `Analyze this PowerPoint slide screenshot and create a high-fidelity "Visual Blueprint" for search.
Focus on:
1. THE KEY TITLE and specific unique text/numbers.
2. Layout structure (e.g. "3-column grid", "centered diagram").
3. Specific shapes, chart types, and diagram structures.
4. Visual density and dominant background colors.
Return a JSON object: { "blueprint": "description here...", "keywords": ["unique text 1", "date/number", "title fragment"] }
CRITICAL: Include the exact title and any unique-looking numbers or codes in keywords.`;

        const transcriptionResult = await generativeModel.generateContent({
            contents: [{
                role: 'user',
                parts: [
                    { text: transcribePrompt },
                    { fileData: { fileUri: gsUri, mimeType: image.type || 'image/jpeg' } }
                ]
            }],
            generationConfig: { responseMimeType: 'application/json' }
        });

        const transcriptionParsed = JSON.parse(transcriptionResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
        const visualDescription = transcriptionParsed.blueprint || '';
        const searchKeywords = Array.isArray(transcriptionParsed.keywords) ? transcriptionParsed.keywords : [];
        
        console.log(`[VisualSearch] Image transcribed into Blueprint (${visualDescription.substring(0, 50)}...) and ${searchKeywords.length} keywords.`);

        // 3. Generate Embedding for the description (Text-to-Text)
        const embedding = await getMultimodalEmbedding({ 
            text: `Visual Blueprint: ${visualDescription}`,
            taskType: 'RETRIEVAL_QUERY'
        });
        console.log(`[VisualSearch] Query embedding generated (${Date.now() - startTime}ms), searching Firestore...`);

        // 3. Vector Search in gtm_slides
        let snapshot;
        try {
            snapshot = await adminDb.collectionGroup('gtm_slides')
                .findNearest('multimodal_embedding', FieldValue.vector(embedding), {
                    limit: 80, // Increased candidate pool for better recall
                    distanceMeasure: 'COSINE',
                    distanceResultField: 'ignored_dist'
                } as any)
                .get();
        } catch (queryError: any) {
            console.error('[VisualSearch] Firestore Query Failed:', queryError.message);
            throw queryError;
        }

        // 4. Manual Cosine Similarity Calculation & Keyword Boosting
        const dotProduct = (a: number[], b: number[]) => a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
        
        const bestMatchesPerAsset = new Map<string, { slideId: string, data: any, similarity: number }>();
        const SIMILARITY_THRESHOLD = 0.20; // Lowered to let more candidates reach AI reranker

        snapshot.docs.forEach((doc: any) => {
            const data = doc.data();
            const assetId = data.assetId;
            if (!assetId) return;

            const docVector = data.multimodal_embedding?._values || data.multimodal_embedding || [];
            let similarity = 0;
            if (docVector.length === embedding.length) {
                similarity = dotProduct(embedding, docVector);
            } else {
                const rawDist = (doc as any).distance ?? doc.get('ignored_dist');
                if (rawDist !== undefined) similarity = 1 - rawDist;
            }
            
            // Keyword Boost: If unique text from screenshot matches slide description
            if (searchKeywords.length > 0 && data.description) {
                const descLower = data.description.toLowerCase();
                let matchCount = 0;
                searchKeywords.forEach((kw: string) => {
                    if (descLower.includes(kw.toLowerCase())) matchCount++;
                });
                if (matchCount > 0) {
                    const boost = Math.min(matchCount * 0.05, 0.15); // Max 0.15 boost
                    similarity += boost;
                    if (matchCount >= 2) similarity += 0.05; // Extra bonus for multiple keyword matches
                }
            }

            if (similarity < SIMILARITY_THRESHOLD) return;

            const currentBest = bestMatchesPerAsset.get(assetId);
            if (!currentBest || similarity > currentBest.similarity) {
                bestMatchesPerAsset.set(assetId, {
                    slideId: doc.id,
                    data,
                    similarity
                });
            }
        });

        // 5. Fetch Metadata & Perform AI RERANKING
        const uniqueAssetIds = Array.from(bestMatchesPerAsset.keys());
        const initialResults = (await Promise.all(uniqueAssetIds.map(async (assetId) => {
            const matchInfo = bestMatchesPerAsset.get(assetId)!;
            try {
                const assetDoc = await adminDb.collection('gtm_assets').doc(assetId).get();
                if (!assetDoc.exists) return null;
                const assetData = assetDoc.data()!;
                return {
                    id: matchInfo.slideId, 
                    assetId: assetId,
                    assetName: assetData.name || matchInfo.data.assetName,
                    slideNumber: matchInfo.data.slideNumber,
                    description: matchInfo.data.description,
                    assetUrl: assetData.url || '#',
                    thumbnail_url: assetData.thumbnail_url || null,
                    category: assetData.category || 'PPT',
                    type: assetData.type || 'PPT',
                    similarity: matchInfo.similarity,
                    created_at: assetData.created_at ? (assetData.created_at.toDate ? assetData.created_at.toDate().toISOString() : assetData.created_at) : new Date().toISOString()
                };
            } catch (err) { return null; }
        }))).filter((r): r is any => r !== null)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 15); // Expanded reranking pool for higher precision

        // 6. AI Verification Step (Reranking)
        if (initialResults.length > 0) {
            console.log(`[VisualSearch] Performing AI Reranking on ${initialResults.length} candidates...`);
            try {
                const rerankPrompt = `I am an intelligent search engine for PowerPoint slides. 
I have a search screenshot and these top ${initialResults.length} candidates.
YOUR TASK: Score each candidate based on how relevant it is to the provided screenshot.

SCORING GUIDELINES:
- EXACT MATCH (90-100): Identical slide (same text, same layout, same numbers).
- HIGH SIMILARITY (70-89): Same specific topic and visual architecture (e.g., another version of the same diagram, or a slide from the same presentation covering the same point).
- TOPICALLY RELEVANT (40-69): Different layout but covers the exact same core subject matter or specific data.
- IRRELEVANT (0-39): Deviates from the topic or visual structure significantly.

CRITICAL: Focus on unique text, diagram types (funnels, grids, charts), and specific terminology. Do not deviate from the core topic.

Return ONLY a JSON array of scores. Format: [95, 75, 20, ...].

Candidates:
${initialResults.map((r, i) => `${i+1}. Asset: ${r.assetName}, Slide ${r.slideNumber}: ${r.description.substring(0, 400)}`).join('\n')}`;

                const rerankResult = await generativeModel.generateContent({
                    contents: [{
                        role: 'user',
                        parts: [
                            { text: rerankPrompt },
                            { fileData: { fileUri: gsUri, mimeType: image.type || 'image/jpeg' } }
                        ]
                    }],
                    generationConfig: { responseMimeType: 'application/json' }
                });

                const scores = JSON.parse(rerankResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]');
                initialResults.forEach((r, i) => {
                    if (scores[i] !== undefined) {
                        const aiScore = scores[i] / 100;
                        console.log(`[VisualSearch] AI Score for "${r.assetName}": ${scores[i]}% (Similarity: ${r.similarity.toFixed(4)})`);
                        // Give AI visual reasoning high weight but maintain some vector signal
                        r.similarity = (r.similarity * 0.25) + (aiScore * 0.75);
                    }
                });
            } catch (rerankError) {
                console.warn('[VisualSearch] Reranking failed:', rerankError);
            }
        }

        const results = initialResults
            .sort((a, b) => b.similarity - a.similarity)
            .filter(r => r.similarity > 0.35); // Lowered slightly since boost/rerank are more granular


        console.log(`[VisualSearch] Returning ${results.length} top unique assets. Total time: ${Date.now() - startTime}ms`);

        // Cleanup: Delete temporary search image
        await fileRef.delete().catch((e: any) => console.error('[VisualSearch] Temp cleanup error:', e));

        return NextResponse.json({ results });
    } catch (error: any) {
        console.error('[VisualSearch] CRITICAL Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
