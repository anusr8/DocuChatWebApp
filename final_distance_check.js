const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
});
const db = admin.firestore();

async function start() {
    console.log("Starting Vector Search...");
    const vector = Array(768).fill(0.1);
    
    const snapshot = await db.collection('gtm_assets')
        .findNearest('metadata_embedding', admin.firestore.FieldValue.vector(vector), {
            limit: 1,
            distanceMeasure: 'COSINE',
            distanceResultField: 'distance'
        }).get();

    if (snapshot.empty) {
        console.log("No docs found.");
        return;
    }

    const doc = snapshot.docs[0];
    console.log("Doc ID:", doc.id);
    console.log("doc.get('distance'):", doc.get('distance'));
    
    console.log("\n--- Keys on snap.docs[0] ---");
    console.log(Object.getOwnPropertyNames(doc));
    
    console.log("\n--- Prototype chain inspection ---");
    let proto = doc;
    while (proto) {
        console.log("Proto:", proto.constructor.name);
        proto = Object.getPrototypeOf(proto);
    }
    
    // Check for any property starting with _ or containing dist
    console.log("\n--- Interesting properties ---");
    for (const key in doc) {
        if (key.toLowerCase().includes('dist')) {
            console.log(`${key}:`, doc[key]);
        }
    }
}

start();
