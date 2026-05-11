const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./Credentials/google-service-account.json', 'utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

async function findDistanceField() {
    try {
        const dummyVector = Array(1408).fill(0.01);
        
        /*
        console.log('\n--- 1. Testing collection("gtm_slides") ---');
        const snap1 = await admin.firestore().collection('gtm_slides')
            .findNearest('multimodal_embedding', admin.firestore.FieldValue.vector(dummyVector), {
                limit: 1,
                distanceMeasure: 'COSINE',
                distanceResultField: 'dist'
            }).get();
        console.log('Collection Match Count:', snap1.size);
        if (snap1.size > 0) {
            console.log('Collection Distance via get("dist"):', snap1.docs[0].get('dist'));
            console.log('Collection Distance via .distance:', snap1.docs[0].distance);
        }
        */

        console.log('\n--- 2. Testing collectionGroup("gtm_slides") ---');
        const snap2 = await admin.firestore().collectionGroup('gtm_slides')
            .findNearest('multimodal_embedding', admin.firestore.FieldValue.vector(dummyVector), {
                limit: 1,
                distanceMeasure: 'COSINE',
                distanceResultField: 'dist'
            }).get();
        console.log('CollectionGroup Match Count:', snap2.size);
        if (snap2.size > 0) {
            console.log('CollectionGroup Distance via get("dist"):', snap2.docs[0].get('dist'));
            console.log('CollectionGroup Distance via .distance:', snap2.docs[0].distance);
        }

    } catch (e) {
        console.error('Diagnostic failed:', e.message);
    }
}

findDistanceField();
