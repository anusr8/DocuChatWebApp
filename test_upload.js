const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
const bucketName = 'tenxds-agents-idp-docuchat';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath),
  storageBucket: bucketName,
});

const bucket = admin.storage().bucket();

async function testUpload() {
    console.log(`Testing upload to bucket: ${bucketName}...`);
    const file = bucket.file('test-connection.txt');
    try {
        await file.save('Connection works!', {
            metadata: { contentType: 'text/plain' }
        });
        console.log('Upload SUCCESSFUL from server-side.');
        
        // Cleanup
        await file.delete();
        console.log('Cleanup successful.');
    } catch (err) {
        console.error('Server-side upload FAILED:', err);
    }
}

testUpload();
