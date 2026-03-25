const admin = require('firebase-admin');
const path = require('path');
const dotenv = require('dotenv');

// Load env vars from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
  storageBucket: storageBucket,
});

const adminDb = admin.firestore();

async function debugFirestore() {
  console.log('--- Debugging Firestore Data ---');
  try {
    const snapshot = await adminDb.collection('gtm_assets').get();
    console.log(`Found ${snapshot.size} documents in gtm_assets\n`);
    
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`- Name: ${data.name}`);
      console.log(`- Type: ${data.type}`);
      console.log(`- Has 'embedding' (Deep Content): ${!!data.embedding}`);
      console.log(`- Has 'metadata_embedding' (Summary): ${!!data.metadata_embedding}`);
      
      if (data.metadata_embedding) {
        // Just log the length of the vector to confirm it's healthy
        console.log(`- Metadata Embedding Length: ${data.metadata_embedding._values?.length || 'N/A'}`);
      }
      
      console.log('---------------------------');
    });

    console.log('\n--- Checking Index Operation (Dry Run Search) ---');
    // We can't easily check 'status' of indexes via SDK, but we can try a vector search and see if it errors
    try {
        const dummyVector = Array(768).fill(0.1); // text-embedding-004/005 is 768
        await adminDb.collection('gtm_assets')
            .findNearest('metadata_embedding', admin.firestore.FieldValue.vector(dummyVector), {
                limit: 1,
                distanceMeasure: 'COSINE'
            }).get();
        console.log('✅ metadata_embedding index is READY for queries.');
    } catch (e) {
        console.error('❌ metadata_embedding index FAIL:', e.message);
    }

    try {
        const dummyVector = Array(768).fill(0.1);
        await adminDb.collection('gtm_assets')
            .findNearest('embedding', admin.firestore.FieldValue.vector(dummyVector), {
                limit: 1,
                distanceMeasure: 'COSINE'
            }).get();
        console.log('✅ embedding index is READY for queries.');
    } catch (e) {
        console.error('❌ embedding index FAIL:', e.message);
    }

  } catch (error) {
    console.error('Error reading Firestore:', error);
  }
}

debugFirestore();
