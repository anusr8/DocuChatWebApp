import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getEmbedding, generativeModel } from '@/lib/vertex';
import fs from 'fs';
import path from 'path';

function debugLog(msg: string) {
    const logPath = path.join(process.cwd(), 'search_debug.log');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');

        if (query && query.trim().length > 0) {
            const queryLower = query.toLowerCase();

            // 1. Query Intent Extraction (Strip filler words for better vector search)
            let optimizedQuery = query;
            try {
                const intentPrompt = `Clean this search query for a vector database by extracting only the core keywords. Remove filler words like 'any', 'video', 'about', 'related to', 'find'. 
Query: "${query}"
Output ONLY the keywords:`;
                const intentResult = await generativeModel.generateContent(intentPrompt);
                const intentText = intentResult.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (intentText && intentText.length > 0) optimizedQuery = intentText;
                console.log(`Original Query: "${query}" | Optimized: "${optimizedQuery}"`);
            } catch (intentErr) {
                console.warn('Intent extraction failed, using original query');
            }

            debugLog(`--- Search Start: "${query}" ---`);
            debugLog(`Optimized Query: "${optimizedQuery}"`);

            // 2. Fetch all assets for keyword fallback
            const allSnapshot = await adminDb.collection('gtm_assets').orderBy('created_at', 'desc').get();
            const allAssets = allSnapshot.docs.map((doc: any) => {
                const data = doc.data();
                return { 
                    id: doc.id, 
                    ...data,
                    created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : new Date().toISOString()
                };
            });

            // 3. Keyword Matching (Fallback)
            const keywordMatches = allAssets.filter((a: any) => 
                a.name.toLowerCase().includes(queryLower) || 
                (a.summary || '').toLowerCase().includes(queryLower)
            ).map((a: any) => ({ ...a, similarity: 1.0, matchType: 'keyword' }));

            debugLog(`Keyword Matches: ${keywordMatches.length}`);

            // 4. Hybrid Semantic Vector Search (Metadata + Deep Content)
            let semanticCandidates: any[] = [];
            try {
                const queryEmbedding = await getEmbedding(optimizedQuery);
                
                // Search in Metadata (Names/Summaries)
                const metaSnapshot = await adminDb.collection('gtm_assets')
                    .findNearest('metadata_embedding', FieldValue.vector(queryEmbedding), {
                        limit: 10,
                        distanceMeasure: 'COSINE',
                        distanceResultField: 'distance'
                    } as any).get();

                // Search in Deep Content (Transcripts/Text)
                const contentSnapshot = await adminDb.collection('gtm_assets')
                    .findNearest('embedding', FieldValue.vector(queryEmbedding), {
                        limit: 10,
                        distanceMeasure: 'COSINE',
                        distanceResultField: 'distance'
                    } as any).get();

                const combinedDocs = [...metaSnapshot.docs, ...contentSnapshot.docs];
                const uniqueDocs = Array.from(new Map(combinedDocs.map(d => [d.id, d])).values());

                semanticCandidates = uniqueDocs
                    .map((doc: any) => {
                        const data = doc.data();
                        
                        // Try multiple field names for distance (SDK differences)
                        const rawDistance = doc.get('distance') ?? 
                                           data.distance ?? 
                                           doc.get('__distance__') ?? 
                                           data.__distance__ ??
                                           doc.get('vector_distance') ?? 
                                           data.vector_distance;

                        // Fallback: If returned by findNearest but distance is missing, assume it's NOT relevant (1.0)
                        // If it's truly not a number, we treat it as 1.0 (maximum distance)
                        const distValue = typeof rawDistance === 'number' ? rawDistance : 1.0;
                        
                        debugLog(`Candidate: ${data.name} | RawDist: ${rawDistance} | Used: ${distValue} | ID: ${doc.id}`);
                        
                        return { 
                            id: doc.id, 
                            ...data,
                            created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : new Date().toISOString(),
                            similarity: 1 - distValue,
                            matchType: 'semantic',
                            rawDistance: distValue
                        };
                    })
                    // Filter by similarity (0.5 cosine distance = 0.5 similarity)
                    .filter((c: any) => c.rawDistance <= 0.5);

            } catch (searchError: any) {
                debugLog(`Vector Error: ${searchError.message}`);
                console.warn('[Search] Vector search failed:', searchError.message);
            }

            // 5. Merge & Deduplicate
            const seenIds = new Set(keywordMatches.map((m: any) => m.id));
            const mergedResults = [...keywordMatches];
            
            debugLog(`Semantic Candidates: ${semanticCandidates.length}`);

            semanticCandidates.forEach(c => {
                if (!seenIds.has(c.id)) {
                    mergedResults.push(c);
                    seenIds.add(c.id);
                }
            });

            if (mergedResults.length === 0) {
                debugLog(`Zero Results.`);
                return NextResponse.json([]);
            }

            // 6. Verification & Final Filtering
            // We want to be strict here to avoid "listing the whole database"
            const semanticOnly = mergedResults.filter(r => r.matchType === 'semantic');
            let finalResults: any[] = [...keywordMatches];

            if (semanticOnly.length > 0) {
                const verificationPrompt = `You are a precision-focused Search Assistant.
User Query: "${query}"

Guidelines:
1. Review the documents below.
2. ONLY include documents that are TRULY RELEVANT to the user's query.
3. If a document is just a general file or unrelated, EXCLUDE it.
4. Reply ONLY with a JSON array of the IDs.

Documents:
${semanticOnly.map((c: any) => `ID: ${c.id} | Name: ${c.name} | Summary: ${c.summary}`).join('\n')}

Response Format: ["id1", "id2", ...]`;
                
                try {
                    const aiResult = await generativeModel.generateContent(verificationPrompt);
                    const aiText = aiResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
                    debugLog(`AI Raw: ${aiText.trim()}`);

                    const verifiedIdsMatch = aiText.match(/\[[\s\S]*\]/);
                    const verifiedIds = verifiedIdsMatch ? JSON.parse(verifiedIdsMatch[0]) : [];
                    
                    const verifiedSemantics = semanticOnly.filter(r => verifiedIds.includes(r.id));
                    finalResults = [...finalResults, ...verifiedSemantics];
                    
                    debugLog(`Final Verified Count: ${finalResults.length}`);
                } catch (e: any) {
                    debugLog(`AI Verify Error: ${e.message}`);
                    // If AI fails, we fall back to a subset of the best semantics to avoid flooding
                    // We only take results with rawDistance <= 0.4 (high confidence)
                    const highConfidenceSemantics = semanticOnly.filter(r => r.rawDistance <= 0.4);
                    finalResults = [...finalResults, ...highConfidenceSemantics.slice(0, 3)];
                }
            }

            // 7. Sort by Similarity (Highest First)
            finalResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

            debugLog(`Total Results: ${finalResults.length}`);
            return NextResponse.json(finalResults);
        }

        // Default: Fetch all assets if no search query
        const snapshot = await adminDb.collection('gtm_assets').orderBy('created_at', 'desc').get();
        const allAssets = snapshot.docs.map((doc: any) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : new Date().toISOString()
            };
        });

        return NextResponse.json(allAssets);
    } catch (error: any) {
        console.error('Fetch assets error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
