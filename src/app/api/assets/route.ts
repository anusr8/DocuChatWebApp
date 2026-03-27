import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getEmbedding, generativeModel } from '@/lib/vertex';
function debugLog(msg: string) {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[DEBUG] ${msg}`);
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');

        if (query && query.trim().length > 0) {
            const startTime = Date.now();
            debugLog(`--- Search Start: "${query}" ---`);

            // 1. Faster Query Intent Extraction (Minimal or Skip for speed)
            let optimizedQuery = query;
            try {
                // Only optimize if the query is long/complex to save time
                if (query.split(' ').length > 4) {
                    const intentPrompt = `Extract core search keywords. Query: "${query}" Output ONLY keywords:`;
                    const intentResult = await generativeModel.generateContent(intentPrompt);
                    const intentText = intentResult.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                    if (intentText && intentText.length > 0) optimizedQuery = intentText;
                }
                debugLog(`Optimized Query: "${optimizedQuery}" (${Date.now() - startTime}ms)`);
            } catch (intentErr) {
                console.warn('Intent extraction failed or timed out, skipping optimization');
            }

            // 2. Parallel Semantic & Keyword Search (Much faster than sequential)
            const queryEmbeddingPromise = getEmbedding(optimizedQuery);
            const allAssetsSnapshotPromise = adminDb.collection('gtm_assets').orderBy('created_at', 'desc').limit(50).get();

            const [queryEmbedding, allSnapshot] = await Promise.all([queryEmbeddingPromise, allAssetsSnapshotPromise]);
            debugLog(`Embeddings & Keyword data fetched (${Date.now() - startTime}ms)`);

            const allAssets = allSnapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data(),
                created_at: doc.data().created_at?.toDate ? doc.data().created_at.toDate().toISOString() : new Date().toISOString()
            }));

            // 3. Keyword Matching (Fallback)
            const queryLower = query.toLowerCase();
            const keywordMatches = allAssets.filter((a: any) => 
                a.name.toLowerCase().includes(queryLower) || 
                (a.summary || '').toLowerCase().includes(queryLower)
            ).map((a: any) => ({ ...a, similarity: 1.0, matchType: 'keyword' }));

            // 4. Semantic Search in Parallel
            const [metaSnapshot, contentSnapshot] = await Promise.all([
                adminDb.collection('gtm_assets').findNearest('metadata_embedding', FieldValue.vector(queryEmbedding), {
                    limit: 8, distanceMeasure: 'COSINE', distanceResultField: 'distance'
                } as any).get(),
                adminDb.collection('gtm_assets').findNearest('embedding', FieldValue.vector(queryEmbedding), {
                    limit: 8, distanceMeasure: 'COSINE', distanceResultField: 'distance'
                } as any).get()
            ]);
            debugLog(`Vector searches completed (${Date.now() - startTime}ms)`);

            const uniqueDocs = Array.from(new Map([...metaSnapshot.docs, ...contentSnapshot.docs].map(d => [d.id, d])).values());

            let semanticCandidates = uniqueDocs.map((doc: any) => {
                const data = doc.data();
                const dist = doc.get('distance') ?? data.distance ?? (doc as any).distance ?? (doc as any).vectorDistance;
                const distValue = typeof dist === 'number' ? dist : undefined;
                
                return { 
                    id: doc.id, 
                    ...data,
                    created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : new Date().toISOString(),
                    similarity: distValue !== undefined ? 1 - distValue : 0.6,
                    matchType: 'semantic',
                    rawDistance: distValue
                };
            }).filter((c: any) => c.rawDistance === undefined || c.rawDistance <= 0.55);

            // 5. Faster Merge & Deduction
            const seenIds = new Set(keywordMatches.map((m: any) => m.id));
            const mergedResults = [...keywordMatches];
            semanticCandidates.forEach(c => { if (!seenIds.has(c.id)) { mergedResults.push(c); seenIds.add(c.id); } });

            // 6. Very Fast Verification (Only if we have too many results)
            let finalResults = mergedResults;
            if (mergedResults.length > 5 && semanticCandidates.length > 0) {
                const candidatesForAI = mergedResults.filter(r => r.matchType === 'semantic').slice(0, 10);
                const verificationPrompt = `Reply ONLY with a JSON array of the IDs relevant to "${query}":\n` + 
                    candidatesForAI.map((c: any) => `ID: ${c.id} | Name: ${c.name}`).join('\n');
                
                try {
                    const aiResult = await generativeModel.generateContent(verificationPrompt);
                    const aiText = aiResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
                    const match = aiText.match(/\[[\s\S]*\]/);
                    const verifiedIds = match ? JSON.parse(match[0]) : [];
                    if (verifiedIds.length > 0) {
                        finalResults = [...keywordMatches, ...mergedResults.filter(r => r.matchType === 'semantic' && verifiedIds.includes(r.id))];
                    }
                } catch (e) {
                    debugLog('Verification skipped/failed');
                    finalResults = mergedResults.slice(0, 5); 
                }
            }

            finalResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
            debugLog(`Total Search Time: ${Date.now() - startTime}ms | Results: ${finalResults.length}`);
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
