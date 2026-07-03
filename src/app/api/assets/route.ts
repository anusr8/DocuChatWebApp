import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getEmbedding, generativeModel } from '@/lib/vertex';

export const maxDuration = 60;
function debugLog(msg: string) {
    if (process.env.NODE_ENV === 'development') {
        console.log(`[DEBUG] ${msg}`);
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const query = searchParams.get('q');
        const type = searchParams.get('type');

        if (query && query.trim().length > 0) {
            const startTime = Date.now();
            debugLog(`--- Search Start: "${query}" (Type: ${type || 'All'}) ---`);

            // 1. Faster Query Intent Extraction (Minimal or Skip for speed)
            let optimizedQuery = query;
            try {
                // Only optimize if the query is long/complex to save time
                if (query.split(' ').length > 2 || query.toLowerCase().includes('gtn')) {
                    const intentPrompt = `Extract core search keywords. Correct typos like "GTN" to "GTM". Query: "${query}" Output ONLY keywords:`;
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
            
            let allAssetsRef = adminDb.collection('gtm_assets');
            if (type && type !== 'All') {
                allAssetsRef = allAssetsRef.where('type', '==', type);
            }
            const allAssetsSnapshotPromise = allAssetsRef.orderBy('created_at', 'desc').limit(50).get();

            const [queryEmbedding, allSnapshot] = await Promise.all([queryEmbeddingPromise, allAssetsSnapshotPromise]);
            debugLog(`Embeddings & Keyword data fetched (${Date.now() - startTime}ms)`);

            const allAssets = allSnapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data(),
                created_at: doc.data().created_at?.toDate ? doc.data().created_at.toDate().toISOString() : new Date().toISOString()
            }));

            // 3. Keyword Matching (Fallback)
            const queryLower = optimizedQuery.toLowerCase();
            const keywordMatches = allAssets.filter((a: any) => 
                a.name.toLowerCase().includes(queryLower) || 
                (a.summary || '').toLowerCase().includes(queryLower)
            ).map((a: any) => ({ ...a, similarity: 1.0, matchType: 'keyword' }));

            // 4. Semantic Search in Parallel
            let metaQuery: any = adminDb.collection('gtm_assets');
            let contentQuery: any = adminDb.collection('gtm_assets');

            if (type && type !== 'All') {
                metaQuery = metaQuery.where('type', '==', type);
                contentQuery = contentQuery.where('type', '==', type);
            }

            const [metaSnapshot, contentSnapshot] = await Promise.all([
                metaQuery.findNearest('metadata_embedding', FieldValue.vector(queryEmbedding), {
                    limit: 12, distanceMeasure: 'COSINE', distanceResultField: 'distance'
                } as any).get(),
                contentQuery.findNearest('embedding', FieldValue.vector(queryEmbedding), {
                    limit: 12, distanceMeasure: 'COSINE', distanceResultField: 'distance'
                } as any).get()
            ]);
            debugLog(`Vector searches completed (${Date.now() - startTime}ms)`);

            const uniqueDocs = Array.from(new Map([...metaSnapshot.docs, ...contentSnapshot.docs].map(d => [d.id, d])).values());

            let semanticCandidates = uniqueDocs.map((doc: any) => {
                const data = doc.data();
                const dist = doc.get('distance') ?? (doc as any).distance ?? (doc as any).vectorDistance;
                const distValue = typeof dist === 'number' ? dist : undefined;
                
                return { 
                    id: doc.id, 
                    ...data,
                    created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : new Date().toISOString(),
                    // Use a safe fallback similarity if distance is missing
                    similarity: distValue !== undefined ? 1 - distValue : 0.6,
                    matchType: 'semantic',
                    rawDistance: distValue
                };
            }).filter((c: any) => c.rawDistance === undefined || c.rawDistance <= 0.40);

            // 5. Faster Merge & Deduction
            const seenIds = new Set(keywordMatches.map((m: any) => m.id));
            const mergedResults = [...keywordMatches];
            semanticCandidates.forEach(c => { if (!seenIds.has(c.id)) { mergedResults.push(c); seenIds.add(c.id); } });

            // 6. Strict AI Verification
            let finalResults = mergedResults;
            if (semanticCandidates.length > 0) {
                const candidatesForAI = mergedResults.filter(r => r.matchType === 'semantic').slice(0, 10);
                const verificationPrompt =
                    `You are a strict Search Quality Auditor. Your job is to filter search results and ONLY keep results that are genuinely relevant to the user's query.\n\nUser Query: "${query}"\n\nFor each candidate below, decide if it is TRULY relevant to the query.\n- If the query is nonsense, misspelled beyond recognition, or completely unrelated to any candidate, return an empty array [].\n- Do NOT return results just because they are close in vector space — only return results with real topical relevance.\n- Return ONLY a JSON array of relevant IDs, nothing else.\n\nResponse Format: ["id1", "id2"] or [] if nothing is relevant.\n\nCandidates:\n` + candidatesForAI.map((c: any) => `ID: ${c.id} | Name: ${c.name} | Summary: ${c.summary}`).join('\n');

                try {
                    const aiResult = await generativeModel.generateContent(verificationPrompt);
                    const aiText = aiResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
                    const match = aiText.match(/\[[\s\S]*?\]/);
                    const verifiedIds: string[] = match ? JSON.parse(match[0]) : [];
                    // ALWAYS apply the AI verdict — even if it returns [] (nothing relevant)
                    finalResults = [...keywordMatches, ...mergedResults.filter(r => r.matchType === 'semantic' && verifiedIds.includes(r.id))];
                } catch (e) {
                    debugLog('Verification failed, falling back to keyword matches only');
                    // On AI failure: only keep keyword matches (strict fallback)
                    finalResults = keywordMatches;
                }
            }


            finalResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
            debugLog(`Total Search Time: ${Date.now() - startTime}ms | Results: ${finalResults.length}`);
            
            return NextResponse.json({
                assets: finalResults,
                pagination: {
                    currentPage: 1,
                    totalPages: 1,
                    totalAssets: finalResults.length,
                    pageSize: finalResults.length
                }
            });
        }

        // Default: Fetch paginated assets if no search query
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('limit') || '12');
        const offset = (page - 1) * pageSize;

        let assets: any[];
        let totalAssets: number;
        let totalPages: number;

        if (type && type !== 'All') {
            // When filtering by type: fetch all matching docs without orderBy to avoid
            // needing a composite index (type + created_at). Sort in-memory then paginate.
            const snapshot = await adminDb
                .collection('gtm_assets')
                .where('type', '==', type)
                .get();

            const allDocs = snapshot.docs
                .map((doc: any) => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        created_at: data.created_at?.toDate
                            ? data.created_at.toDate().toISOString()
                            : new Date().toISOString()
                    };
                })
                .sort((a: any, b: any) =>
                    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );

            totalAssets = allDocs.length;
            totalPages = Math.ceil(totalAssets / pageSize);
            assets = allDocs.slice(offset, offset + pageSize);
        } else {
            // No type filter: use efficient indexed query with server-side pagination
            const baseQuery = adminDb.collection('gtm_assets');

            const countSnapshot = await baseQuery.count().get();
            totalAssets = countSnapshot.data().count;
            totalPages = Math.ceil(totalAssets / pageSize);

            const snapshot = await baseQuery
                .orderBy('created_at', 'desc')
                .offset(offset)
                .limit(pageSize)
                .get();

            assets = snapshot.docs.map((doc: any) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    created_at: data.created_at?.toDate
                        ? data.created_at.toDate().toISOString()
                        : new Date().toISOString()
                };
            });
        }

        return NextResponse.json({
            assets,
            pagination: {
                currentPage: page,
                totalPages,
                totalAssets,
                pageSize
            }
        });
    } catch (error: any) {
        console.error('Fetch assets error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
