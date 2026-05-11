const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');

// Load .env.local
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

const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const project = serviceAccount.project_id;
const location = 'us-central1';

const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

async function getEmbedding(text) {
    const client = await auth.getClient();
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/text-embedding-005:predict`;
    const res = await client.request({
        url,
        method: 'POST',
        data: {
            instances: [{ content: text }],
        },
    });
    return res.data.predictions[0].embeddings.values;
}

async function debug() {
    const query = 'Computer Vision';
    console.log('Query:', query);
    
    const queryEmbedding = await getEmbedding(query);
    
    console.log('\n--- Vector Search Results (embedding) ---');
    const snapshot = await db.collection('gtm_assets')
        .findNearest('embedding', admin.firestore.FieldValue.vector(queryEmbedding), {
            limit: 10,
            distanceMeasure: 'COSINE',
            distanceResultField: 'distance'
        }).get();

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        // Check all possible places for distance
        const dist = doc.get('distance') ?? data.distance ?? doc.get('__distance_result__') ?? data.__distance_result__;
        console.log(`- ${data.name.padEnd(40)} | dist: ${dist} | keys: ${Object.keys(doc)} | dataKeys: ${Object.keys(data)}`);
    });
}

debug().catch(console.error);
