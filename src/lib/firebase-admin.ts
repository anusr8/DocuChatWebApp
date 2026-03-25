import * as admin from 'firebase-admin';
import path from 'path';

if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    let credential;

    if (serviceAccountJson) {
      console.log(`[Firebase Admin] Initializing with Environment Credentials`);
      credential = admin.credential.cert(JSON.parse(serviceAccountJson));
    } else {
      console.log(`[Firebase Admin] Initializing with Master Service Account File`);
      const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
      credential = admin.credential.cert(serviceAccountPath);
    }

    const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    
    console.log(`[Firebase Admin] Project: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`);
    console.log(`[Firebase Admin] Bucket: ${storageBucket}`);

    admin.initializeApp({
      credential,
      storageBucket: storageBucket,
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error);
  }
}

export const adminDb = admin.apps.length ? admin.firestore() : null as any;
export const adminStorage = admin.apps.length ? admin.storage() : null as any;
