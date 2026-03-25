const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');

async function testEmbeddings() {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = './service-account-key.json';
    const project = 'lifeline-healthcare-484505';
    const location = 'us-central1';

    const models = ['text-embedding-004', 'text-embedding-005'];

    const auth = new GoogleAuth({
        scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    const client = await auth.getClient();

    for (const model of models) {
        console.log(`Testing model: ${model}...`);
        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:predict`;

        try {
            const res = await client.request({
                url,
                method: 'POST',
                data: {
                    instances: [{ content: 'Test string for quota' }],
                },
            });
            console.log(`✅ ${model} SUCCESS`);
        } catch (err) {
            console.log(`❌ ${model} FAILED: ${err.message}`);
            if (err.response && err.response.data) {
                console.log('Error details:', JSON.stringify(err.response.data));
            }
        }
    }
}

testEmbeddings();
