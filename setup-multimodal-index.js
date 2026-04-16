const { v1 } = require('@google-cloud/firestore');
const path = require('path');

async function createMultimodalIndex() {
  const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
  const firestoreAdminClient = new v1.FirestoreAdminClient({
    keyFilename: serviceAccountPath,
  });

  const project = "tenxds-agents-idp";
  const parent = `projects/${project}/databases/(default)/collectionGroups/gtm_slides`;

  console.log(`Creating vector index for: ${parent}`);

  const index = {
    queryScope: 'COLLECTION_GROUP',
    fields: [
      {
        fieldPath: 'multimodal_embedding',
        vectorConfig: {
          dimension: 1408,
          flat: {}
        }
      }
    ]
  };

  try {
    const [operation] = await firestoreAdminClient.createIndex({
      parent,
      index
    });

    console.log('Index creation started. Operation:', operation.name);
    console.log('This may take several minutes. You can check status in Firebase Console.');
  } catch (err) {
    if (err.message.includes('already exists')) {
        console.log('Index already exists.');
    } else {
        console.error("Failed to create index:", err);
    }
  }
}

createMultimodalIndex();
