const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const { VertexAI, FieldValue } = require('@google-cloud/vertexai');

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    env.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        process.env[parts[0].trim()] = parts.slice(1).join('=').trim();
      }
    });
  }
}

loadEnv();

const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const vertexAI = new VertexAI({ project, location });

// Using the same model as in vertex.ts
const generativeModel = vertexAI.getGenerativeModel({
    model: 'gemini-2.0-flash-001',
});

const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
  storageBucket: storageBucket,
});

const adminDb = admin.firestore();

async function getEmbeddings(texts) {
    const auth = new (require('google-auth-library').GoogleAuth)({
        scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    const client = await auth.getClient();
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/text-embedding-005:predict`;

    const res = await client.request({
        url,
        method: 'POST',
        data: {
            instances: texts.map(text => ({ content: text })),
        },
    });

    return res.data.predictions.map((p) => p.embeddings.values);
}

async function verify() {
  console.log('--- VERIFICATION START ---');
  const query = "hindi";
  const queryLower = query.toLowerCase();
  
  try {
    // 1. Keyword Falling
    const allSnapshot = await adminDb.collection('gtm_assets').get();
    const allAssets = allSnapshot.docs.map(doc => {
        const data = doc.data();
        return { 
            id: doc.id, 
            ...data,
            created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : new Date().toISOString()
        };
    });

    const keywordMatches = allAssets.filter(a => 
        a.name.toLowerCase().includes(queryLower) || 
        (a.summary || '').toLowerCase().includes(queryLower)
    );
    console.log(`Keyword Matches: ${keywordMatches.length}`);

    // 2. Semantic Search
    const [queryEmbedding] = await getEmbeddings([query]);
    
    // Using simple vector search logic from route.ts
    // metadata_embedding
    const metaSnapshot = await adminDb.collection('gtm_assets')
        .findNearest('metadata_embedding', admin.firestore.FieldValue.vector(queryEmbedding), {
            limit: 10,
            distanceMeasure: 'COSINE',
            distanceResultField: 'distance'
        }).get();

    const semanticCandidates = metaSnapshot.docs.map(doc => {
        const data = doc.data();
        const rawDistance = doc.get('distance');
        // If distance is missing, assume it's very far (1.0)
        const distValue = typeof rawDistance === 'number' ? rawDistance : 1.0;
        return {
            id: doc.id,
            name: data.name,
            created_at: data.created_at?.toDate ? data.created_at.toDate().toISOString() : new Date().toISOString(),
            rawDistance: distValue
        };
    }).filter(c => c.rawDistance <= 0.5); // New threshold

    console.log(`Semantic Candidates (Threshold 0.5): ${semanticCandidates.length}`);
    semanticCandidates.forEach(c => console.log(` - ${c.name} (Dist: ${c.rawDistance.toFixed(4)}) | Date: ${c.created_at}`));

    // 3. AI Verification (Test the new model)
    if (semanticCandidates.length > 0) {
        console.log("Testing AI Verification...");
        const verificationPrompt = `You are a precision-focused Search Assistant.
User Query: "${query}"
Review the documents below and ONLY include documents that are TRULY RELEVANT.
Reply ONLY with a JSON array of the IDs.
Documents:
${semanticCandidates.map(c => `ID: ${c.id} | Name: ${c.name}`).join('\n')}
Response Format: ["id1", "id2", ...]`;

        const aiResult = await generativeModel.generateContent(verificationPrompt);
        const aiText = aiResult.response.candidates[0].content.parts[0].text;
        console.log(`AI Reponse: ${aiText.trim()}`);
    } else {
        console.log("No semantic candidates to verify, which is EXPECTED for 'hindi'.");
    }

  } catch (err) {
    console.error('Verification script failed:', err);
  }
}

verify();
