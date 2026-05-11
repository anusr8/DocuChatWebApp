const admin = require('firebase-admin');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./Credentials/google-service-account.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

async function debugEmbeddings() {
    try {
        const client = await auth.getClient();
        const project = serviceAccount.project_id;
        const location = 'us-central1';
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/multimodalembedding@001:predict`;

        console.log('--- Testing Multimodal Embedding API ---');
        const res = await client.request({
            url,
            method: 'POST',
            data: {
                instances: [{ text: "PowerPoint slide with a 3-layer diagram" }],
                parameters: { dimension: 1408 }
            },
        });

        const data = res.data;
        if (data.predictions && data.predictions[0]) {
            const embedding = data.predictions[0].textEmbedding;
            console.log('Embedding Success! Length:', embedding.length);
            console.log('First 5 values:', embedding.slice(0, 5));

            console.log('\n--- Searching Firestore ---');
            const snapshot = await admin.firestore().collectionGroup('gtm_slides')
                .findNearest('multimodal_embedding', admin.firestore.FieldValue.vector(embedding), {
                    limit: 5,
                    distanceMeasure: 'COSINE',
                    distanceResultField: 'distance'
                })
                .get();

            if (snapshot.empty) {
                console.log('No matches found in Firestore.');
            } else {
                snapshot.docs.forEach(doc => {
                    const d = doc.data();
                    console.log(`Document ID: ${doc.id}`);
                    console.log(`Available Keys in doc:`, Object.keys(doc));
                    console.log(`Distance via get('distance'):`, doc.get('distance'));
                    // Check internal symbols or hidden properties
                    const prototypeKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(doc));
                    console.log('Prototype keys:', prototypeKeys);
                });
            }
        } else {
            console.log('No predictions returned:', JSON.stringify(data));
        }

    } catch (e) {
        console.error('Debug failed:', e.message);
        if (e.response) console.error('Response Data:', JSON.stringify(e.response.data));
    }
}

debugEmbeddings();
