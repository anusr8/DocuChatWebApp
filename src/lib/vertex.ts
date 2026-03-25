import { VertexAI } from '@google-cloud/vertexai'
import { GoogleAuth } from 'google-auth-library'

const project = process.env.GOOGLE_CLOUD_PROJECT!
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'

export const vertexAI = new VertexAI({ project, location })

// Verified model: gemini-2.0-flash-001 is the working version for this project
export const generativeModel = vertexAI.getGenerativeModel({
    model: 'gemini-2.0-flash-001',
})

const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
})

/**
 * Helper to generate embeddings for multiple text chunks in a single batch.
 * Vertex AI supports up to 250 instances per request.
 */
export async function getEmbeddings(texts: string[], retries = 3): Promise<number[][]> {
    try {
        const client = await auth.getClient()
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/text-embedding-005:predict`

        const res = await client.request({
            url,
            method: 'POST',
            data: {
                instances: texts.map(text => ({ content: text })),
            },
        })

        const data = res.data as any;
        if (!data.predictions || data.predictions.length === 0) {
            throw new Error('No embeddings returned from Vertex AI');
        }
        return data.predictions.map((p: any) => p.embeddings.values);
    } catch (error: any) {
        // Retry logic for quota limits or transient network resets
        const isRetryable = (error.code === 429) || (error.code === 'ECONNRESET') || (error.message?.includes('ECONNRESET'));
        
        if (isRetryable && retries > 0) {
            const delay = error.code === 429 ? 5000 : 1000;
            console.warn(`Vertex AI Transient Error (${error.code || 'ECONNRESET'}), retrying in ${delay/1000}s... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return getEmbeddings(texts, retries - 1);
        }

        console.error('Vertex AI Batch Embedding Error:', error);
        throw error;
    }
}

/**
 * Legacy single embedding helper
 */
export async function getEmbedding(text: string): Promise<number[]> {
    const results = await getEmbeddings([text]);
    return results[0];
}
