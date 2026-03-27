import { NextResponse } from 'next/server';
import { vertexAI, generativeModel, getEmbedding } from '@/lib/vertex';

export async function GET() {
    const diagnostic: any = {
        timestamp: new Date().toISOString(),
        env: {
            hasServiceAccountEnv: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
            googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || 'NOT SET',
            googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION || 'NOT SET',
        },
        steps: []
    };

    try {
        // Step 1: Check Auth
        diagnostic.steps.push({ name: 'Init', status: 'OK' });

        // Step 2: Try Embedding
        try {
            diagnostic.steps.push({ name: 'Embedding Start' });
            const emb = await getEmbedding('test');
            diagnostic.steps.push({ name: 'Embedding Success', size: emb.length });
        } catch (e: any) {
            diagnostic.steps.push({ name: 'Embedding Failed', error: e.message, code: e.code });
        }

        // Step 3: Try Gemini
        try {
            diagnostic.steps.push({ name: 'Gemini Start' });
            const result = await generativeModel.generateContent('Hi');
            diagnostic.steps.push({ name: 'Gemini Success', response: result.response.candidates?.[0]?.content?.parts?.[0]?.text });
        } catch (e: any) {
            diagnostic.steps.push({ name: 'Gemini Failed', error: e.message, code: e.code });
        }

        return NextResponse.json(diagnostic);
    } catch (error: any) {
        return NextResponse.json({ 
            status: 'CRITICAL_ERROR', 
            error: error.message,
            diagnostic 
        }, { status: 500 });
    }
}
