import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getMultimodalEmbedding, generativeModel } from '@/lib/vertex';

export const maxDuration = 300;

const dotProduct = (a: number[], b: number[]) =>
    a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);

function getVector(doc: any): number[] {
    const v = doc.data().multimodal_embedding;
    if (!v) return [];
    if (typeof v.toArray === 'function') return v.toArray();
    if (Array.isArray(v._values)) return v._values;
    return [];
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const image = formData.get('image') as File | null;
        if (!image) return NextResponse.json({ error: 'Image is required' }, { status: 400 });

        const startTime = Date.now();
        console.log(`[VisualSearch] Received image: ${image.name} (${image.size} bytes)`);

        // ── STEP 1: Upload screenshot to GCS ──────────────────────────────
        const bucket = adminStorage.bucket();
        const tempPath = `temp-searches/${Date.now()}-${image.name}`;
        const fileRef = bucket.file(tempPath);
        const buffer = Buffer.from(await image.arrayBuffer());
        await fileRef.save(buffer, { metadata: { contentType: image.type || 'image/jpeg' } });
        const gsUri = `gs://${bucket.name}/${tempPath}`;
        console.log('[VisualSearch] Uploaded to:', gsUri);

        // ── STEP 2: Parallel — transcription + image embedding ────────────
        const transcribePrompt = `You are a PowerPoint slide search engine.
Analyze this slide screenshot and extract MAXIMALLY SPECIFIC identifiers to find it in a database.

Return JSON with EXACTLY these fields:
{
  "title": "The EXACT text of the slide title, copied verbatim",
  "subtitle": "Any subtitle or secondary heading text, verbatim",
  "unique_phrases": ["exact phrase 1 from slide body", "unique term 2", "specific name or acronym"],
  "numbers": ["every number/percentage/date visible, e.g. 95%, $2.3M, Q3 2024"],
  "layout": "exact layout description: e.g. 2-column with image right, funnel diagram 5 stages",
  "blueprint": "One dense paragraph capturing ALL of the above combined for semantic search"
}

RULES:
- Copy text VERBATIM — do not paraphrase or summarize.
- Include EVERY number, percentage, currency, or date visible.
- "unique_phrases" must be specific terms that would ONLY appear in THIS slide.
- Generic terms like "growth" or "AI" alone are NOT useful — combine with context.`;

        const [transcriptionResult, imageEmbedding] = await Promise.all([
            generativeModel.generateContent({
                contents: [{
                    role: 'user',
                    parts: [
                        { text: transcribePrompt },
                        { fileData: { fileUri: gsUri, mimeType: image.type || 'image/jpeg' } }
                    ]
                }],
                generationConfig: { responseMimeType: 'application/json' }
            }),
            getMultimodalEmbedding({ imageUri: gsUri })
        ]);

        let transcription: any = {};
        try {
            transcription = JSON.parse(
                transcriptionResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
            );
        } catch { transcription = {}; }

        const exactTitle: string = transcription.title || '';
        const subtitle: string = transcription.subtitle || '';
        const uniquePhrases: string[] = Array.isArray(transcription.unique_phrases) ? transcription.unique_phrases : [];
        const numbers: string[] = Array.isArray(transcription.numbers) ? transcription.numbers : [];
        const visualDescription: string = transcription.blueprint || '';
        
        // Combined keyword list for matching with stop words and length constraints
        const stopWords = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'with', 'about', 'slide', 'presentation', 'page']);
        const allKeywords: string[] = [exactTitle, subtitle, ...uniquePhrases, ...numbers]
            .filter(k => k && k.trim().length >= 2)
            .map(k => k.trim())
            .filter(k => {
                const lower = k.toLowerCase();
                if (stopWords.has(lower)) return false;
                // If it contains only digits/percentages, require 2+ characters
                if (/^\d+%?$/.test(k)) return k.length >= 2;
                return k.length >= 4; // Text keywords must be at least 4 chars long to prevent generic matching
            });

        console.log(`[VisualSearch] Title: "${exactTitle}" | Keywords: ${JSON.stringify(allKeywords.slice(0, 6))}`);

        // ── STEP 3: Text blueprint embedding (align prefix with Visual Blueprint:) ──
        const textEmbedding = await getMultimodalEmbedding({
            text: `Visual Blueprint: ${exactTitle}. ${visualDescription}`.slice(0, 1000)
        });
        console.log(`[VisualSearch] Embeddings ready (${Date.now() - startTime}ms). Running 3-track search...`);

        // ── STEP 4: Three parallel searches ───────────────────────────────
        // Track A: vector search by text blueprint embedding
        // Track B: vector search by direct image embedding
        // Track C: keyword scan across ALL 960 slide descriptions (lightweight select)
        const VECTOR_LIMIT = 150;

        let snapshotA: any, snapshotB: any, allSlidesSnap: any;
        try {
            [snapshotA, snapshotB, allSlidesSnap] = await Promise.all([
                adminDb.collectionGroup('gtm_slides')
                    .findNearest('multimodal_embedding', FieldValue.vector(textEmbedding), {
                        limit: VECTOR_LIMIT,
                        distanceMeasure: 'COSINE',
                        distanceResultField: 'vdist'
                    } as any).get(),
                adminDb.collectionGroup('gtm_slides')
                    .findNearest('multimodal_embedding', FieldValue.vector(imageEmbedding), {
                        limit: VECTOR_LIMIT,
                        distanceMeasure: 'COSINE',
                        distanceResultField: 'vdist'
                    } as any).get(),
                // Lightweight scan — only fetch the fields needed for keyword matching
                // Omits the 1408-float vector, reducing data transfer significantly
                adminDb.collectionGroup('gtm_slides')
                    .select('description', 'assetId', 'assetName', 'slideNumber')
                    .get()
            ]);
        } catch (queryError: any) {
            console.error('[VisualSearch] Query Failed:', queryError.message);
            throw queryError;
        }

        console.log(`[VisualSearch] Searches done: textVec=${snapshotA.size}, imgVec=${snapshotB.size}, allSlides=${allSlidesSnap.size} (${Date.now() - startTime}ms)`);

        // ── STEP 5: Merge all three tracks ────────────────────────────────
        // Map: docId → { data, textSim, imageSim, keywordScore, isKeywordMatch }
        const slideMap = new Map<string, {
            data: any;
            textSim: number;
            imageSim: number;
            keywordScore: number;
            isKeywordMatch: boolean;
        }>();

        // Process vector search results
        const addVectorResult = (doc: any, type: 'text' | 'image', embedding: number[]) => {
            const data = doc.data();
            if (!data.assetId) return;
            const vec = getVector(doc);
            const sim = vec.length === embedding.length ? dotProduct(embedding, vec) : 0;

            const existing = slideMap.get(doc.id);
            if (!existing) {
                slideMap.set(doc.id, {
                    data,
                    textSim: type === 'text' ? sim : 0,
                    imageSim: type === 'image' ? sim : 0,
                    keywordScore: 0,
                    isKeywordMatch: false
                });
            } else {
                if (type === 'text') existing.textSim = Math.max(existing.textSim, sim);
                else existing.imageSim = Math.max(existing.imageSim, sim);
            }
        };

        snapshotA.docs.forEach((doc: any) => addVectorResult(doc, 'text', textEmbedding));
        snapshotB.docs.forEach((doc: any) => addVectorResult(doc, 'image', imageEmbedding));

        // Process keyword scan (Track C) — runs over ALL slides
        if (allKeywords.length > 0) {
            allSlidesSnap.docs.forEach((doc: any) => {
                const data = doc.data();
                if (!data.assetId || !data.description) return;

                const descLower = data.description.toLowerCase();
                let kScore = 0;

                // Exact title is the strongest signal
                if (exactTitle.length >= 3) {
                    const titleLower = exactTitle.toLowerCase();
                    if (descLower.includes(titleLower)) {
                        // Full title match — very high score
                        kScore += 100;
                    } else {
                        // Partial title match — word by word
                        const titleWords = titleLower.split(/\s+/).filter(w => w.length >= 4);
                        const wordsMatched = titleWords.filter(w => descLower.includes(w)).length;
                        if (wordsMatched > 0) kScore += (wordsMatched / Math.max(titleWords.length, 1)) * 40;
                    }
                }

                // Subtitle match
                if (subtitle.length >= 3 && descLower.includes(subtitle.toLowerCase())) {
                    kScore += 30;
                }

                // Unique phrases
                uniquePhrases.forEach(phrase => {
                    if (phrase.length >= 3 && descLower.includes(phrase.toLowerCase())) kScore += 25;
                });

                // Numbers/dates (very discriminative when matched)
                numbers.forEach(num => {
                    if (num.length >= 2 && descLower.includes(num.toLowerCase())) kScore += 35;
                });

                if (kScore === 0) return; // No keyword match — skip

                const existing = slideMap.get(doc.id);
                if (!existing) {
                    // This slide was NOT in vector results — add it via keyword track
                    slideMap.set(doc.id, {
                        data,
                        textSim: 0,
                        imageSim: 0,
                        keywordScore: kScore,
                        isKeywordMatch: true
                    });
                } else {
                    existing.keywordScore = kScore;
                    existing.isKeywordMatch = true;
                }
            });

            const kwMatches = Array.from(slideMap.values()).filter(s => s.isKeywordMatch).length;
            console.log(`[VisualSearch] Keyword track found ${kwMatches} matching slides`);
        }

        // ── STEP 6: Combined scoring & per-asset deduplication ────────────
        // Formula: keyword score dominates when present (it's very precise).
        // Vector scores act as tiebreakers and catch cases where text descriptions don't have the exact title.
        const assetMap = new Map<string, {
            slideId: string;
            data: any;
            finalScore: number;
            isKeywordMatch: boolean;
        }>();

        slideMap.forEach(({ data, textSim, imageSim, keywordScore, isKeywordMatch }, docId) => {
            const assetId = data.assetId;

            // Normalize keyword score to 0-1 range (max possible ~200)
            const normalizedKw = Math.min(keywordScore / 150, 1.0);
            // Scale image similarity into text similarity range
            const scaledImg = Math.min(imageSim * 8, 1.0);
            // Combined: keyword is dominant, vectors are support signals
            const finalScore = (normalizedKw * 0.60) + (textSim * 0.25) + (scaledImg * 0.15);

            const current = assetMap.get(assetId);
            if (!current || finalScore > current.finalScore) {
                assetMap.set(assetId, { slideId: docId, data, finalScore, isKeywordMatch });
            }
        });

        // Sort: purely by finalScore (which includes keyword support) rather than sorting keywords strictly at the top.
        // This ensures high-similarity vector candidates are not excluded from reranking due to generic keyword matches.
        const THRESHOLD = 0.15; // Low threshold — reranker will filter further
        const ranked = Array.from(assetMap.values())
            .filter(c => c.finalScore > THRESHOLD)
            .sort((a, b) => b.finalScore - a.finalScore);

        console.log(`[VisualSearch] ${ranked.length} candidates (${ranked.filter(r => r.isKeywordMatch).length} keyword, ${ranked.filter(r => !r.isKeywordMatch).length} vector) (${Date.now() - startTime}ms)`);

        // ── STEP 7: Fetch asset metadata for top candidates ───────────────
        const TOP_FOR_RERANKING = 25; // Expanded pool from 15 to 25 to catch more candidates
        const topCandidates = ranked.slice(0, TOP_FOR_RERANKING);

        const initialResults = (await Promise.all(topCandidates.map(async (c) => {
            try {
                const assetDoc = await adminDb.collection('gtm_assets').doc(c.data.assetId).get();
                if (!assetDoc.exists) return null;
                const assetData = assetDoc.data()!;
                return {
                    id: c.slideId,
                    assetId: c.data.assetId,
                    assetName: assetData.name || c.data.assetName,
                    slideNumber: c.data.slideNumber,
                    description: c.data.description || '',
                    assetUrl: assetData.url || '#',
                    thumbnail_url: assetData.thumbnail_url || null,
                    category: assetData.category || 'PPT',
                    type: assetData.type || 'PPT',
                    similarity: c.finalScore,
                    isKeywordMatch: c.isKeywordMatch,
                    created_at: assetData.created_at
                        ? (assetData.created_at.toDate ? assetData.created_at.toDate().toISOString() : assetData.created_at)
                        : new Date().toISOString()
                };
            } catch { return null; }
        }))).filter((r): r is any => r !== null);

        // ── STEP 8: AI Reranker — Gemini scores each candidate against the actual screenshot ──
        if (initialResults.length > 0) {
            console.log(`[VisualSearch] AI Reranking ${initialResults.length} candidates...`);
            try {
                const rerankPrompt = `You are a PowerPoint Slide Visual Search Auditor.
You will see a search screenshot and a numbered list of candidate slides (with their stored descriptions).

TASK: Assign a relevance score 0–100 to each candidate.

SCORING RULES:
- 95–100: EXACT slide — title, layout, data, and visual style all match perfectly.
- 80–94: Very close match — same title OR same key data, slight differences in layout.
- 60–79: Same presentation or topic, clearly a related but different slide.
- 30–59: Same broad topic but different specific content.
- 0–29: Unrelated or only superficially similar (e.g., both dark-themed).

WHAT TO LOOK FOR in the screenshot:
- The EXACT slide title text — does the candidate description mention it?
- Specific numbers, percentages, or dates — do they appear in the description?
- Layout type (funnel, grid, chart) — does it match?
- Company/product names — are they the same?

Return ONLY a JSON array of integers, one per candidate, in order.
Example for 5 candidates: [12, 95, 34, 8, 67]

Candidates:
${initialResults.map((r, i) =>
    `${i + 1}. Asset: "${r.assetName}" | Slide ${r.slideNumber}\nDescription: ${r.description.substring(0, 600)}`
).join('\n\n')}`;

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

                const rawText = rerankResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
                const scores: number[] = JSON.parse(rawText);

                if (Array.isArray(scores)) {
                    initialResults.forEach((r, i) => {
                        if (scores[i] !== undefined) {
                            const aiScore = scores[i] / 100;
                            console.log(`[VisualSearch] Reranker: "${r.assetName}" Slide ${r.slideNumber} → ${scores[i]}%`);
                            // Reranker dominates — it sees the actual image
                            // Keyword-matched slides get extra protection from being demoted
                            const vectorWeight = r.isKeywordMatch ? 0.20 : 0.10;
                            r.similarity = (r.similarity * vectorWeight) + (aiScore * (1 - vectorWeight));
                        }
                    });
                }
            } catch (rerankError) {
                console.warn('[VisualSearch] Reranking failed, using combined scores:', rerankError);
            }
        }

        // ── STEP 9: Final output ──────────────────────────────────────────
        // Keep keyword matches even at lower scores (they're likely correct but description may be generic)
        const results = initialResults
            .sort((a, b) => b.similarity - a.similarity)
            .filter(r => r.similarity > 0.30 || (r.isKeywordMatch && r.similarity > 0.20));

        console.log(`[VisualSearch] Returning ${results.length} results. Total time: ${Date.now() - startTime}ms`);

        // Cleanup
        await fileRef.delete().catch((e: any) => console.error('[VisualSearch] Cleanup error:', e));

        return NextResponse.json({ results });
    } catch (error: any) {
        console.error('[VisualSearch] CRITICAL Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
