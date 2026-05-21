const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Path to service account
const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');

if (!fs.existsSync(serviceAccountPath)) {
    console.error('Service account file not found at:', serviceAccountPath);
    process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccountPath)
});

const db = admin.firestore();

async function promoteAdmin() {
  const email = 'admin@10xds.com';
  console.log(`Promoting ${email} to admin...`);

  try {
    const snapshot = await db.collection('users').where('email', '==', email).get();

    if (snapshot.empty) {
      console.log(`User ${email} not found. Creating user...`);
      await db.collection('users').add({
        email: email,
        password: 'pass@word1', // Temporary, should be changed
        role: 'admin',
        isFirstLogin: true,
        createdAt: new Date().toISOString()
      });
      console.log(`User ${email} created as admin with password: pass@word1`);
    } else {
      const userDoc = snapshot.docs[0];
      await userDoc.ref.update({
        role: 'admin',
        password: 'pass@word1'
      });
      console.log(`User ${email} promoted to admin and password updated.`);
    }
  } catch (error) {
    console.error('Error promoting admin:', error);
  } finally {
    process.exit(0);
  }
}

promoteAdmin();
