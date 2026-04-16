import { VertexAI } from '@google-cloud/vertexai'
import { GoogleAuth } from 'google-auth-library'

let project = process.env.GOOGLE_CLOUD_PROJECT!
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'

// Reusable auth options
const authOptions: any = {
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
}

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
        const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        authOptions.credentials = credentials;
        // Fallback to project_id from credentials if environment variable is missing
        if (!project && credentials.project_id) {
            project = credentials.project_id;
        }
    } catch (e) {
        console.error('Error parsing FIREBASE_SERVICE_ACCOUNT_JSON:', e);
    }
}

export const vertexAI = new VertexAI({
    project,
    location,
    googleAuthOptions: authOptions
})

// Verified model: gemini-2.0-flash-001 is the working version for this project
export const generativeModel = vertexAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
})

const auth = new GoogleAuth(authOptions)

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
            console.warn(`Vertex AI Transient Error (${error.code || 'ECONNRESET'}), retrying in ${delay / 1000}s... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return getEmbeddings(texts, retries - 1);
        }

        console.error('Vertex AI Batch Embedding Error:', error);
        throw error;
    }
}

/**
 * Multimodal embedding helper (New for March 2026)
 * Supports text, images, and documents.
 */
export async function getMultimodalEmbedding(input: { text?: string, imageUri?: string, mimeType?: string, taskType?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' }): Promise<number[]> {
    try {
        const client = await auth.getClient();
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/multimodalembedding@001:predict`;

        const instance: any = {};
        if (input.text) {
            // Truncate text to 1000 chars (limit is 1024 total including surrounding structures)
            instance.text = input.text.slice(0, 1000);
        }
        if (input.imageUri) {
            instance.image = { gcsUri: input.imageUri };
        }

        const res = await client.request({
            url,
            method: 'POST',
            data: {
                instances: [instance],
                parameters: {
                    dimension: 1408
                }
            },
        });

        const data = res.data as any;
        if (!data.predictions || data.predictions.length === 0) {
            throw new Error('No multimodal embeddings returned');
        }

        const prediction = data.predictions[0];
        return prediction.imageEmbedding || prediction.textEmbedding || [];
    } catch (error: any) {
        let errorMsg = error.message;
        if (error.response?.data?.error?.message) {
            errorMsg = error.response.data.error.message;
        }
        console.error('Vertex AI Multimodal Embedding Error:', errorMsg);
        throw new Error(`Multimodal embedding failed with the following error: ${errorMsg}`);
    }
}

/**
 * Legacy single embedding helper
 */
export async function getEmbedding(text: string): Promise<number[]> {
    const results = await getEmbeddings([text]);
    return results[0];
}
