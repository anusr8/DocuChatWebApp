const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Simple .env.local parser
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

const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
  storageBucket: storageBucket,
});

const adminDb = admin.firestore();

async function debug() {
  console.log('--- START DEBUG ---');
  try {
    const snapshot = await adminDb.collection('gtm_assets').get();
    console.log(`Total Docs: ${snapshot.size}`);

    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`\nDoc ID: ${doc.id}`);
      console.log(`Name: ${data.name}`);
      console.log(`Has meta_embed: ${!!data.metadata_embedding}`);
      console.log(`Has content_embed: ${!!data.embedding}`);
      console.log(`Summary Preview: ${data.summary?.substring(0, 50)}...`);
    });

    console.log('\n--- TESTING REAL QUERY: "health care" ---');
    // Note: Since we can't easily generate embeddings in this simple script without lib/vertex,
    // we'll just check if the metadata_embedding field exists and has the right dimension.
    const firstDoc = snapshot.docs[0].data();
    const vecSize = firstDoc.metadata_embedding?._values?.length || 0;
    console.log(`Vector Dimension: ${vecSize}`);

    // Let's try to fetch using a real similarity query if possible 
    // or just verify if the findNearest works with a non-zero vector.
    const realVector = Array(768).fill(0.05); 
    try {
        const testRes = await adminDb.collection('gtm_assets')
            .findNearest('metadata_embedding', admin.firestore.FieldValue.vector(realVector), {
                limit: 5,
                distanceMeasure: 'COSINE',
                distanceResultField: 'distance'
            }).get();
        
        console.log(`Results Found: ${testRes.size}`);
        testRes.docs.forEach(doc => {
            const data = doc.data();
            console.log(`- ${data.name}`);
            console.log(`  Properties on doc: ${Object.keys(doc).join(', ')}`);
            console.log(`  Distance via doc.get('distance'): ${doc.get('distance')}`);
            
            // Check all potential keys for distance
            for (let key in doc) {
              if (key.includes('dist') || key.includes('vector')) {
                console.log(`  Property found: ${key} = ${doc[key]}`);
              }
            }
        });
    } catch (e) {
        console.error(`Vector Search Error: ${e.message}`);
    }

  } catch (err) {
    console.error(err);
  }
}

debug();
