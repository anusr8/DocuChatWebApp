const { v1 } = require('@google-cloud/firestore');
const path = require('path');

async function checkIndexStatus() {
  const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
  const firestoreAdminClient = new v1.FirestoreAdminClient({
    keyFilename: serviceAccountPath,
  });

  const project = "tenxds-agents-idp";
  const parentPath = `projects/${project}/databases/(default)/collectionGroups/gtm_assets`;

  console.log(`Checking indexes for: ${parentPath}`);
  
  try {
    const [indexes] = await firestoreAdminClient.listIndexes({ parent: parentPath });
    
    if (!indexes || indexes.length === 0) {
      console.log("No indexes found.");
      return;
    }

    indexes.forEach(idx => {
      console.log(`\nIndex: ${idx.name}`);
      console.log(`State: ${idx.state}`);
      console.log(`Query Scope: ${idx.queryScope}`);
      if (idx.fields) {
        idx.fields.forEach(f => {
          console.log(`Field: ${f.fieldPath}`);
          if (f.vectorConfig) {
            console.log(`  Vector Config: dimension ${f.vectorConfig.dimension}`);
          }
        });
      }
    });
  } catch (err) {
    console.error("Failed to list indexes:", err);
  }
}

checkIndexStatus();
