const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const env = fs.readFileSync(envPath, 'utf8');
    env.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        process.env[parts[0].trim()] = parts.slice(1).join('=').trim();
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

async function inspect() {
  console.log('--- DATA INSPECTION START ---');
  try {
    const snapshot = await adminDb.collection('gtm_assets').limit(10).get();
    console.log(`Found ${snapshot.size} assets.`);
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`\nID: ${doc.id}`);
      console.log(`Name: ${data.name}`);
      console.log(`Type: ${data.type}`);
      console.log(`Created At: ${JSON.stringify(data.created_at)} (Type: ${typeof data.created_at})`);
      if (data.created_at && data.created_at.toDate) {
          console.log(`  As Date: ${data.created_at.toDate().toISOString()}`);
      }
    });

  } catch (err) {
    console.error('Inspection failed:', err);
  }
}

inspect();
