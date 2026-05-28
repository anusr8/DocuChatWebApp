import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getEmbedding, generativeModel } from '@/lib/vertex';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    try {
        const { message } = await req.json();

        if (!message) {
            return NextResponse.json({ error: 'No message provided' }, { status: 400 });
        }

        const startTime = Date.now();
        console.log(`[Chat] Request received: "${message.substring(0, 50)}..."`);

        // Optimize/expand search query to handle acronyms (e.g. CV -> Computer Vision) and typos
        let searchQuery = message;
        try {
            const intentPrompt = `You are a Search Intent Optimizer. Analyze the user's conversational message and extract a concise search query tailored for retrieving corporate GTM documents from a vector database. Expand all industry abbreviations/acronyms to their full names (e.g., expand "CV" to "Computer Vision", "NLP" to "Natural Language Processing", "RPA" to "Robotic Process Automation", "GenAI" to "Generative Artificial Intelligence"). Correct any spelling mistakes.
User message: "${message}"
Search Query:`;
            const intentResult = await generativeModel.generateContent(intentPrompt);
            const intentText = intentResult.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (intentText && intentText.length > 0) {
                searchQuery = intentText;
                console.log(`[Chat] Expanded search query: "${searchQuery}"`);
            }
        } catch (intentErr) {
            console.warn('[Chat] Intent extraction failed, using raw message:', intentErr);
        }

        const queryEmbedding = await getEmbedding(searchQuery);
        console.log(`[Chat] Embedding generated using search query "${searchQuery.substring(0, 50)}..." (${Date.now() - startTime}ms)`);
        
        // 1. Dual Vector Search + Keyword Fallback
        let candidates: any[] = [];
        try {
            // A. Vector searches in parallel
            const [contentSnapshot, metadataSnapshot, allSnapshot] = await Promise.all([
                adminDb.collection('gtm_assets')
                    .findNearest('embedding', FieldValue.vector(queryEmbedding), {
                        limit: 5, distanceMeasure: 'COSINE', distanceResultField: 'distance'
                    } as any).get(),
                adminDb.collection('gtm_assets')
                    .findNearest('metadata_embedding', FieldValue.vector(queryEmbedding), {
                        limit: 5, distanceMeasure: 'COSINE', distanceResultField: 'distance'
                    } as any).get(),
                adminDb.collection('gtm_assets').limit(100).get() // For keyword fallback
            ]);

            // B. Process vector results
            const vectorDocs = new Map();
            [...contentSnapshot.docs, ...metadataSnapshot.docs].forEach((doc: any) => {
                const data = doc.data();
                const dist = doc.get('distance') ?? data.distance ?? 0.4;
                const existing = vectorDocs.get(doc.id);
                if (!existing || dist < existing.rawDistance) {
                    vectorDocs.set(doc.id, {
                        id: doc.id,
                        ...data,
                        rawDistance: dist,
                        similarity: 1 - dist,
                        matchType: 'vector'
                    });
                }
            });

            // C. Keyword fallback
            const messageLower = message.toLowerCase();
            const searchQueryLower = searchQuery.toLowerCase();
            const keywordDocs = allSnapshot.docs
                .map((doc: any) => ({ id: doc.id, ...doc.data() }))
                .filter((doc: any) => 
                    doc.name.toLowerCase().includes(messageLower) || 
                    (doc.summary || '').toLowerCase().includes(messageLower) ||
                    doc.name.toLowerCase().includes(searchQueryLower) || 
                    (doc.summary || '').toLowerCase().includes(searchQueryLower)
                )
                .map((doc: any) => ({
                    ...doc,
                    rawDistance: 0.1, // High priority for keyword matches
                    similarity: 0.9,
                    matchType: 'keyword'
                }));

            // D. Merge
            const mergedMap = new Map(vectorDocs);
            keywordDocs.forEach((kd: any) => {
                if (!mergedMap.has(kd.id)) mergedMap.set(kd.id, kd);
            });

            candidates = Array.from(mergedMap.values())
                .filter((c: any) => c.rawDistance <= 0.7) // Slightly more relaxed
                .sort((a, b) => a.rawDistance - b.rawDistance);

        } catch (searchError: any) {
            console.error('[Chat] Search Error:', searchError);
            throw searchError;
        }

        console.log(`[Chat] Search found ${candidates.length} candidates (${Date.now() - startTime}ms)`);

        // 2. AI Verification (More balanced)
        let verifiedDocs = candidates;
        if (candidates.length > 0) {
            const verificationPrompt = `As a GTM Search Assistant, evaluate these documents for the query: "${message}" (specifically looking for context around: "${searchQuery}")
Return the IDs of documents that are RELEVANT and can help provide an answer. 
Include documents that provide context, even if they aren't a perfect match.

Documents:
${candidates.map((c: any) => `ID: ${c.id} | Name: ${c.name} | Summary: ${c.summary}`).join('\n')}

Response Format: ["id1", "id2", ...]
If none are relevant, respond with [].`;

            try {
                const aiVerifyResult = await generativeModel.generateContent(verificationPrompt);
                const aiVerifyText = aiVerifyResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
                const verifiedIdsMatch = aiVerifyText.match(/\[.*\]/);
                const verifiedIds = verifiedIdsMatch ? JSON.parse(verifiedIdsMatch[0]) : [];
                
                if (verifiedIds.length > 0) {
                    verifiedDocs = candidates.filter(c => verifiedIds.includes(c.id));
                } else {
                    // Fallback to top 2 if they are reasonably close
                    verifiedDocs = candidates.filter(c => c.rawDistance <= 0.45).slice(0, 2);
                }
            } catch (pErr) {
                console.error('[Chat] AI Verification Error, using top candidates');
                verifiedDocs = candidates.slice(0, 2);
            }
        }

        // 3. Construct Context for LLM Answer
        const context = verifiedDocs.length > 0 
            ? verifiedDocs.slice(0, 5).map((doc: any) =>
                `---\n[Source: ${doc.type} - ${doc.name}]\nSummary: ${doc.summary || 'N/A'}\nContent: ${doc.content || 'No detailed content available'}\n---`
            ).join('\n\n')
            : 'NO ASSETS FOUND IN THE KNOWLEDGE BASE.';

        const recommendations = verifiedDocs.slice(0, 3).map((doc: any) => ({
            id: doc.id,
            name: doc.name,
            type: doc.type.toUpperCase(),
            url: doc.url,
            similarity: doc.similarity
        }));

        const prompt = `You are a specialized GTM (Go-To-Market) Assistant.
Use the provided context to answer the user's query. 

GUIDELINES for an Ultra-Clean Response:
1. MINIMALISM: Provide extremely short summaries (max 1-2 sentences per document).
2. CLEAN FORMATTING: Do NOT use markdown headers (###). Use a simple numbered list (1, 2, 3).
3. BOLDING: Bold ONLY the Document/Product name. Do NOT bold labels like "Key Benefit:".
4. NO SYMBOLS: Avoid excessive asterisks or symbols. Keep it looking like a clean message.
5. NO BOILERPLATE: Skip all metadata and contact info.

Context:
${context}

User Query: ${message}`;



        const chatResponse = await generativeModel.generateContent(prompt);
        const answer = chatResponse.response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";


        console.log(`[Chat] Completed in ${Date.now() - startTime}ms`);


        return NextResponse.json({
            answer,
            recommendations
        });
    } catch (error: any) {
        console.error('[Chat] Full Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
