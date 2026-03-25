const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');

// 1. Load Environment
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    env.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length === 2) {
        process.env[parts[0].trim()] = parts[1].trim();
      }
    });
  }
}
loadEnv();

const project = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');

// 2. Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
});
const db = admin.firestore();

// 3. Embedding Helper (Standalone)
async function getEmbedding(text) {
  const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
    keyFilename: serviceAccountPath
  });
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

// 4. Run Test
async function runTest(queryText) {
  console.log(`\n--- Searching for: "${queryText}" ---`);
  try {
    const embedding = await getEmbedding(queryText);
    console.log(`Generated Embedding (dim: ${embedding.length})`);

    const snapshot = await db.collection('gtm_assets')
      .findNearest('metadata_embedding', admin.firestore.FieldValue.vector(embedding), {
        limit: 5,
        distanceMeasure: 'COSINE',
        distanceResultField: 'distance'
      }).get();

    console.log(`Found ${snapshot.size} matches:`);
    snapshot.docs.forEach((doc, i) => {
      const data = doc.data();
      const dist = doc.get('distance');
      console.log(`${i+1}. ${data.name}`);
      console.log(`   - Data Keys: ${Object.keys(data).join(', ')}`);
      console.log(`   - Snapshot Keys/Methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(doc)).filter(n => typeof doc[n] !== 'function').join(', ')}`);
      console.log(`   - doc.get('distance'): ${doc.get('distance')}`);
      console.log(`   - doc.get('vector_distance'): ${doc.get('vector_distance')}`);
      console.log(`   - data.distance: ${data.distance}`);
      console.log(`   - data.vector_distance: ${data.vector_distance}`);
    });

  } catch (err) {
    console.error('Test failed:', err);
  }
}

async function start() {
    await runTest("healthcare");
    await runTest("health care");
    await runTest("any video related to health care");
}

start();
