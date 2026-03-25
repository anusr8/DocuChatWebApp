import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getEmbedding, generativeModel } from '@/lib/vertex';

export async function POST(req: NextRequest) {
    try {
        const { message } = await req.json();

        if (!message) {
            return NextResponse.json({ error: 'No message provided' }, { status: 400 });
        }

        const queryEmbedding = await getEmbedding(message);
        
        // 1. Initial Vector Search with Tighter Threshold
        let candidates: any[] = [];
        try {
            const snapshot = await adminDb.collection('gtm_assets')
                .findNearest('embedding', FieldValue.vector(queryEmbedding), {
                    limit: 10, // Fetch more for initial filtering
                    distanceMeasure: 'COSINE',
                    distanceResultField: 'distance'
                } as any)
                .get();

            candidates = snapshot.docs
                .map((doc: any) => {
                    const data = doc.data();
                    const rawDistance = doc.get('distance') ?? 
                                       data.distance ?? 
                                       doc.get('__distance__') ?? 
                                       data.__distance__ ??
                                       doc.get('vector_distance') ?? 
                                       data.vector_distance;

                    // Fallback: If returned by findNearest but distance is missing, assume it's relevant (0.1)
                    const distValue = typeof rawDistance === 'number' ? rawDistance : 0.1;

                    return {
                        id: doc.id,
                        ...data,
                        similarity: 1 - distValue,
                        rawDistance: distValue
                    };
                })
                .filter((c: any) => c.rawDistance <= 0.6); // Reasonable threshold for chat relevance
        } catch (searchError: any) {
            console.error('Unified Search Error:', searchError);
            throw searchError;
        }

        if (candidates.length === 0) {
            return NextResponse.json({
                answer: "I'm sorry, I couldn't find any relevant documents in the GTM library to answer that.",
                recommendations: []
            });
        }

        // 2. AI Verification (The "Auditor" Step)
        // Strictly verify which candidates actually answer the user's specific query
        const verificationPrompt = `You are a strict Search Quality Auditor for a GTM Knowledge Base.
User Query: "${message}"

Below are potential matches from our vector search. 
Review each one and decide if it contains information that directly helps answer the user query.
Be very strict. If a document is about "AI Agents" and the user asks about "Leave Policy", it is NOT relevant.

Matches:
${candidates.map((c: any) => `ID: ${c.id} | Name: ${c.name} | Summary: ${c.summary}`).join('\n')}

Respond ONLY with a JSON array of the IDs (strings) that are highly relevant and should be used to answer the query.
Example: ["abc1234", "def5678"]
If none are strictly relevant, respond with [].`;

        const aiVerifyResult = await generativeModel.generateContent(verificationPrompt);
        const aiVerifyText = aiVerifyResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        
        let verifiedDocs = candidates;
        try {
            const verifiedIdsMatch = aiVerifyText.match(/\[.*\]/);
            const verifiedIds = verifiedIdsMatch ? JSON.parse(verifiedIdsMatch[0]) : [];
            verifiedDocs = candidates.filter(c => verifiedIds.includes(c.id));
        } catch (pErr) {
            console.error('AI Verification Parse Error:', pErr);
            verifiedDocs = candidates.slice(0, 2); // Safety fallback
        }

        // 3. Construct Context for LLM Answer
        const context = verifiedDocs.map((doc: any) =>
            `---
[Source: ${doc.type} - ${doc.name}]
Summary: ${doc.summary || 'N/A'}
Content Overview: ${doc.content}
---`
        ).join('\n\n');

        // Prepare Top 3 Recommendations
        const recommendations = verifiedDocs.slice(0, 3).map((doc: any) => ({
            id: doc.id,
            name: doc.name,
            type: doc.type.toUpperCase(),
            url: doc.url,
            similarity: doc.similarity
        }));

        const prompt = `You are a specialized GTM (Go-To-Market) Intelligence Assistant. 

STRICT GROUNDING RULES:
1. ONLY use the provided "GTM Assets in Context" to answer the user query.
2. If the context is empty, you MUST say: "I'm sorry, I couldn't find any relevant documents in the GTM library to answer that."
3. Cite the Source name and Type clearly.

GTM Assets in Context:
${context || 'NO RELEVANT ASSETS FOUND'}

User Query:
${message}
`;

        const chatResponse = await generativeModel.generateContent(prompt);
        const candidate = chatResponse.response.candidates?.[0];
        const answer = candidate?.content?.parts?.[0]?.text || "I'm sorry, I couldn't find any relevant documents in the GTM library to answer that.";

        return NextResponse.json({
            answer,
            recommendations
        });
    } catch (error: any) {
        console.error('Chat error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
