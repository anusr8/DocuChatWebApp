const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
});
const db = admin.firestore();

async function debugDistance() {
  console.log("--- EXHAUSTIVE DISTANCE DEBUG ---");
  
  // Dummy vector (zeros)
  const vector = Array(768).fill(0.1);
  
  try {
    const snapshot = await db.collection('gtm_assets')
      .findNearest('metadata_embedding', admin.firestore.FieldValue.vector(vector), {
        limit: 1,
        distanceMeasure: 'COSINE',
        distanceResultField: 'distance_test_field'
      }).get();

    if (snapshot.empty) {
      console.log("No documents found in gtm_assets.");
      return;
    }

    const doc = snapshot.docs[0];
    console.log("Found document:", doc.id);
    
    console.log("\n--- Property Keys ---");
    console.log(Object.keys(doc));

    console.log("\n--- Proto Keys ---");
    console.log(Object.keys(Object.getPrototypeOf(doc)));

    console.log("\n--- Internal State ---");
    // Some versions of the SDK store it in _distance or similar
    for (const key in doc) {
      if (key.includes('dist')) {
        console.log(`Found key matching 'dist': ${key} = ${doc[key]}`);
      }
    }

    console.log("\n--- get('distance_test_field') ---");
    console.log(doc.get('distance_test_field'));

    console.log("\n--- data() ---");
    console.log(doc.data());

  } catch (err) {
    console.error("Debug failed:", err);
  }
}

debugDistance();
