const { v1 } = require('@google-cloud/firestore');
const path = require('path');

async function runRawSearch() {
  const serviceAccountPath = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
  const client = new v1.FirestoreClient({
    keyFilename: serviceAccountPath,
  });

  const project = "tenxds-agents-idp";
  const database = `projects/${project}/databases/(default)`;
  
  // Create a 768-dim vector
  const vector = Array(768).fill(0.01);

  const request = {
    parent: `${database}/documents`,
    structuredQuery: {
      from: [{ collectionId: 'gtm_assets' }],
      findNearest: {
        vectorField: { fieldPath: 'metadata_embedding' },
        queryVector: {
          mapValue: {
            fields: {
              __vector__: {
                arrayValue: {
                  values: vector.map(v => ({ doubleValue: v }))
                }
              }
            }
          }
        },
        distanceMeasure: 'COSINE',
        limit: { value: 1 },
        distanceResultField: 'distance'
      }
    }
  };

  console.log("Sending raw runQuery request...");
  try {
    const stream = client.runQuery(request);
    stream.on('data', response => {
      console.log("RAW RESPONSE:", JSON.stringify(response, null, 2));
    });
    stream.on('error', err => {
      console.error("Stream error:", err);
    });
    stream.on('end', () => {
      console.log("Stream ended.");
    });
  } catch (err) {
    console.error("Raw search failed:", err);
  }
}

runRawSearch();
