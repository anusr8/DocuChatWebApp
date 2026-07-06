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
                        limit: 20, distanceMeasure: 'COSINE', distanceResultField: 'distance'
                    } as any).get(),
                adminDb.collection('gtm_assets')
                    .findNearest('metadata_embedding', FieldValue.vector(queryEmbedding), {
                        limit: 20, distanceMeasure: 'COSINE', distanceResultField: 'distance'
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
                const verifiedIdsMatch = aiVerifyText.match(/\[[\s\S]*?\]/);
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
            ? verifiedDocs.map((doc: any) =>
                `---\n[Source: ${doc.type} - ${doc.name}]\nSummary: ${doc.summary || 'N/A'}\nContent: ${doc.content || 'No detailed content available'}\n---`
            ).join('\n\n')
            : 'NO ASSETS FOUND IN THE KNOWLEDGE BASE.';

        const recommendations = verifiedDocs.map((doc: any) => ({
            id: doc.id,
            name: doc.name,
            type: doc.type.toUpperCase(),
            url: doc.url,
            similarity: doc.similarity,
            summary: doc.summary || doc.description || ''
        }));

        const isMeetingQuery = /\b(meeting|pitch|presentation|demo|client|customer|prepare|preparing|prep)\b/i.test(message);

        const prompt = `You are a helpful and professional GTM (Go-To-Market) Consultant and Assistant.
Use the provided context to answer the user's query in a detailed, conversational, and highly informative manner.

GUIDELINES:
1. CONVERSATIONAL ANCHORING: Open with a natural, helpful response directly addressing the user's query. Do NOT use a generic greeting.
2. DOCUMENT RECOMMENDATIONS: Present only the GTM documents from the context that are genuinely relevant to the user's query. For each:
   - State the exact document name in **bold** with its type (PDF, PPT, etc.).
   - Write a concise 2-sentence description of what it covers and why it is relevant to this specific query.
3. ${isMeetingQuery
    ? 'ACTIONABLE INSIGHTS: Add a brief, practical closing section with tips on how to use these materials to prepare for the meeting/presentation.'
    : 'DIRECT ANSWER: If the context contains factual information that directly answers the query, summarise it clearly after listing the documents. Skip any meeting-prep advice — it is not relevant here.'
}
4. CLEAN LAYOUT: Use standard markdown bullets or numbered lists. Keep formatting premium and readable. Do NOT add sections that are not relevant to the user's actual question.

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
