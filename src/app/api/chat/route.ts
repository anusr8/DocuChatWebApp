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

        const startTime = Date.now();
        console.log(`[Chat] Request received: "${message.substring(0, 50)}..."`);

        const queryEmbedding = await getEmbedding(message);
        console.log(`[Chat] Embedding generated (${Date.now() - startTime}ms)`);
        
        // 1. Initial Vector Search
        let candidates: any[] = [];
        try {
            const snapshot = await adminDb.collection('gtm_assets')
                .findNearest('embedding', FieldValue.vector(queryEmbedding), {
                    limit: 8,
                    distanceMeasure: 'COSINE',
                    distanceResultField: 'distance'
                } as any)
                .get();

            candidates = snapshot.docs
                .map((doc: any) => {
                    const data = doc.data();
                    const rawDistance = doc.get('distance') ?? 
                                       data.distance ?? 
                                       doc.get('vectorDistance') ?? 
                                       data.vectorDistance ??
                                       doc.get('__distance__') ?? 
                                       data.__distance__ ??
                                       doc.get('vector_distance') ?? 
                                       data.vector_distance;

                    // Fallback: If distance is missing, assume neutral relevance (0.4)
                    const distValue = typeof rawDistance === 'number' ? rawDistance : 0.4;

                    return {
                        id: doc.id,
                        ...data,
                        similarity: 1 - distValue,
                        rawDistance: distValue
                    };
                })
                .filter((c: any) => c.rawDistance <= 0.65);
        } catch (searchError: any) {
            console.error('[Chat] Vector Search Error:', searchError);
            throw searchError;
        }

        console.log(`[Chat] Vector search found ${candidates.length} candidates (${Date.now() - startTime}ms)`);

        if (candidates.length === 0) {
            return NextResponse.json({
                answer: "I'm sorry, I couldn't find any relevant documents in the GTM library to answer that.",
                recommendations: []
            });
        }

        // 2. Focused AI Verification (The "Auditor" Step)
        let verifiedDocs = candidates;
        const verificationPrompt = `As a strict Search Auditor, evaluate these documents for the query: "${message}"
Return ONLY IDs that directly and specifically answer the query. 
If a document is only tangentially related, EXCLUDE it.

Documents:
${candidates.map((c: any) => `ID: ${c.id} | Name: ${c.name} | Summary: ${c.summary}`).join('\n')}

Response Format: ["id1", "id2", ...]
If none are strictly relevant, respond with [].`;

        try {
            const aiVerifyResult = await generativeModel.generateContent(verificationPrompt);
            const aiVerifyText = aiVerifyResult.response.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
            const verifiedIdsMatch = aiVerifyText.match(/\[.*\]/);
            const verifiedIds = verifiedIdsMatch ? JSON.parse(verifiedIdsMatch[0]) : [];
            
            if (verifiedIds.length > 0) {
                verifiedDocs = candidates.filter(c => verifiedIds.includes(c.id));
            } else {
                // If AI finds nothing, we are very strict and only keep the single best match IF it has high confidence
                verifiedDocs = candidates[0].rawDistance <= 0.3 ? [candidates[0]] : [];
            }
        } catch (pErr) {
            console.error('[Chat] AI Verification Error, falling back to top candidates');
            verifiedDocs = candidates.slice(0, 1);
        }

        // 3. Construct Context for LLM Answer
        const context = verifiedDocs.slice(0, 5).map((doc: any) =>
            `---\n[Source: ${doc.type} - ${doc.name}]\nSummary: ${doc.summary || 'N/A'}\nContent: ${doc.content}\n---`
        ).join('\n\n');

        const recommendations = verifiedDocs.slice(0, 3).map((doc: any) => ({
            id: doc.id,
            name: doc.name,
            type: doc.type.toUpperCase(),
            url: doc.url,
            similarity: doc.similarity
        }));

        const prompt = `You are a specialized GTM (Go-To-Market) Assistant.\n\nContext:\n${context || 'NO ASSETS FOUND'}\n\nUser Query: ${message}`;

        const chatResponse = await generativeModel.generateContent(prompt);
        const answer = chatResponse.response.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't find a clear answer.";

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
