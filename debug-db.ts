import { adminDb } from './src/lib/firebase-admin';

async function debugFirestore() {
  console.log('--- Debugging Firestore ---');
  try {
    const snapshot = await adminDb.collection('gtm_assets').get();
    console.log(`Found ${snapshot.size} documents in gtm_assets`);
    
    snapshot.forEach((doc: any) => {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`- Name: ${data.name}`);
      console.log(`- Has Embedding: ${!!data.embedding}`);
      console.log(`- Has Metadata Embedding: ${!!data.metadata_embedding}`);
      console.log(`- Distance (example): ${data.distance || 'N/A'}`);
    });
  } catch (error) {
    console.error('Error reading Firestore:', error);
  }
}

debugFirestore();
