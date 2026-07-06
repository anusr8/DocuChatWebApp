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

            // 1. Strong Query Intent Extraction — matches the chat API approach
            let optimizedQuery = query;
            try {
                const intentPrompt = `You are a Search Intent Optimizer. Analyze the user's message and extract a concise search query for retrieving corporate GTM documents from a vector database.\n- Expand abbreviations/acronyms (e.g. "CV" → "Computer Vision", "NLP" → "Natural Language Processing").\n- Correct spelling mistakes (e.g. "andesron" → "Anderson", "GTN" → "GTM").\n- If the message is conversational (e.g. "is there anything about X?"), extract just the core topic.\n- Output ONLY the cleaned search query, nothing else.\n\nUser message: "${query}"\nSearch Query:`;
                const intentResult = await generativeModel.generateContent(intentPrompt);
                const intentText = intentResult.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (intentText && intentText.length > 0) optimizedQuery = intentText;
                debugLog(`Optimized Query: "${optimizedQuery}" (${Date.now() - startTime}ms)`);
            } catch (intentErr) {
                console.warn('Intent extraction failed or timed out, using raw query');
            }

            // 2. Parallel Embedding + Keyword Fetch
            const queryEmbeddingPromise = getEmbedding(optimizedQuery);

            let allAssetsRef = adminDb.collection('gtm_assets');
            if (type && type !== 'All') {
                allAssetsRef = allAssetsRef.where('type', '==', type);
            }
            // Fetch more docs so keyword search covers older assets too
            const allAssetsSnapshotPromise = allAssetsRef.orderBy('created_at', 'desc').limit(200).get();

            const [queryEmbedding, allSnapshot] = await Promise.all([queryEmbeddingPromise, allAssetsSnapshotPromise]);
            debugLog(`Embeddings & Keyword data fetched (${Date.now() - startTime}ms)`);

            const allAssets = allSnapshot.docs.map((doc: any) => ({
                id: doc.id,
                ...doc.data(),
                created_at: doc.data().created_at?.toDate ? doc.data().created_at.toDate().toISOString() : new Date().toISOString()
            }));

            // 3. Keyword Matching (Fallback)
            const queryLower = optimizedQuery.toLowerCase();
            const rawQueryLower = query.toLowerCase();
            const keywordMatches = allAssets.filter((a: any) => 
                a.name.toLowerCase().includes(queryLower) || 
                (a.summary || '').toLowerCase().includes(queryLower) ||
                a.name.toLowerCase().includes(rawQueryLower) || 
                (a.summary || '').toLowerCase().includes(rawQueryLower)
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
            }).filter((c: any) => c.rawDistance === undefined || c.rawDistance <= 0.55);

            // 5. Merge keyword + semantic candidates
            const seenIds = new Set(keywordMatches.map((m: any) => m.id));
            const mergedResults = [...keywordMatches];
            semanticCandidates.forEach(c => { if (!seenIds.has(c.id)) { mergedResults.push(c); seenIds.add(c.id); } });

            // 6. AI Verification — always applied so empty results are honoured
            let finalResults = mergedResults;
            if (semanticCandidates.length > 0) {
                const candidatesForAI = mergedResults.filter(r => r.matchType === 'semantic').slice(0, 10);
                const verificationPrompt =
                    `You are a GTM Search Quality Auditor. Evaluate these documents for the user's query and return only the IDs of documents that are RELEVANT.\n\nUser Query: "${query}"\n\nRules:\n- Include documents that are genuinely related to the query topic, even if the query is misspelled or uses domain-specific terms.\n- Exclude documents that are clearly unrelated to the topic.\n- If NOTHING is relevant at all, return [].\n- Return ONLY a JSON array of relevant IDs, nothing else.\n\nResponse Format: ["id1", "id2"] or [] if nothing is relevant.\n\nCandidates:\n` + candidatesForAI.map((c: any) => `ID: ${c.id} | Name: ${c.name} | Summary: ${c.summary}`).join('\n');

                try {
                    const aiResult = await generativeModel.generateContent(verificationPrompt);
                    const aiText = aiResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
                    const match = aiText.match(/\[[\s\S]*?\]/);
                    const verifiedIds: string[] = match ? JSON.parse(match[0]) : [];

                    if (verifiedIds.length > 0) {
                        // AI found relevant results — use them
                        finalResults = [...keywordMatches, ...mergedResults.filter(r => r.matchType === 'semantic' && verifiedIds.includes(r.id))];
                    } else {
                        // AI returned [] — fallback: show top candidates that are reasonably close
                        // (distance <= 0.45, same threshold as the chat API)
                        const closeCandidates = semanticCandidates.filter(c => c.rawDistance !== undefined && c.rawDistance <= 0.45).slice(0, 3);
                        finalResults = [...keywordMatches, ...closeCandidates];
                    }
                } catch (e) {
                    debugLog('AI verification failed, using keyword matches + close semantic results');
                    finalResults = [...keywordMatches, ...semanticCandidates.filter(c => c.rawDistance !== undefined && c.rawDistance <= 0.45).slice(0, 3)];
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
