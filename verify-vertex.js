const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs');
const path = require('path');

async function verify() {
    const envPath = path.join(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');

    const env = {};
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            env[key.trim()] = value.trim();
        }
    });

    process.env.GOOGLE_APPLICATION_CREDENTIALS = env.GOOGLE_APPLICATION_CREDENTIALS;
    const project = env.GOOGLE_CLOUD_PROJECT;
    const location = env.GOOGLE_CLOUD_LOCATION || 'us-central1';

    console.log(`Verifying Vertex AI with Project: ${project}, Location: ${location}`);
    console.log(`Credentials Path: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);

    try {
        const vertexAI = new VertexAI({ project, location });
        const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro'];

        for (const modelName of models) {
            console.log(`Testing model: ${modelName}...`);
            try {
                const model = vertexAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent('Say "Vertex AI is connected!"');
                const response = await result.response;
                console.log(`✅ ${modelName} SUCCESS:`, response.candidates[0].content.parts[0].text.trim());
                return; // Exit on first success
            } catch (err) {
                console.log(`❌ ${modelName} FAILED: ${err.message.split('\n')[0]}`);
            }
        }
        console.error('All models failed. Please ensure Vertex AI API is enabled in project "tenxds-agents-idp".');
    } catch (err) {
        console.error('❌ Vertex AI connection FAILED:', err);
    }
}

verify();
