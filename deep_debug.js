const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const util = require('util');
const { VertexAI } = require('@google-cloud/vertexai');

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
const vertexAI = new VertexAI({ project, location });
const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
  storageBucket: storageBucket,
});

const adminDb = admin.firestore();

async function deepDebug() {
  console.log('--- DEEP DEBUG START ---');
  try {
    const query = "any video related to health care";
    console.log(`Original Query: "${query}"`);

    // Test Intent Extraction
    const intentPrompt = `Clean this search query for a vector database by extracting only the core keywords. Remove filler words like 'any', 'video', 'about', 'related to', 'find'. 
Query: "${query}"
Output ONLY the keywords:`;
    const intentResult = await generativeModel.generateContent(intentPrompt);
    const intentText = intentResult.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    console.log(`Optimized Intent: "${intentText}"`);

    // Test Search
    const dummyVector = Array(768).fill(0.01);
    const testRes = await adminDb.collection('gtm_assets')
        .findNearest('metadata_embedding', admin.firestore.FieldValue.vector(dummyVector), {
            limit: 5,
            distanceMeasure: 'COSINE',
            distanceResultField: 'distance'
        }).get();

    console.log(`Results Found: ${testRes.size}`);
    testRes.docs.forEach(doc => {
        const data = doc.data();
        console.log(`- ${data.name} | Doc.get('distance'): ${doc.get('distance')} | data.distance: ${data.distance}`);
    });

  } catch (err) {
    console.error('Debug failed:', err);
  }
}

deepDebug();
