const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs');

async function listModels() {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = './tenxds-agents-idp-e065e517d947.json';
    const project = 'tenxds-agents-idp';
    const location = 'us-central1';

    console.log(`Listing models for project: ${project}, location: ${location}...`);

    try {
        const vertexAI = new VertexAI({ project, location });
        // The listModels method isn't directly on VertexAI class in this SDK usually, 
        // researchers often use the REST API. 
        // But let's try to initialize a few possible ones and see if they fail.

        const modelsToTest = [
            'gemini-1.5-flash',
            'gemini-1.5-flash-001',
            'gemini-1.5-flash-002',
            'gemini-1.5-pro',
            'gemini-2.0-flash-exp',
            'gemini-2.0-flash-001',
            'gemini-2.5-flash' // testing user's suggestion
        ];

        for (const modelName of modelsToTest) {
            try {
                const model = vertexAI.getGenerativeModel({ model: modelName });
                // We need to actually call it to see if it exists
                await model.generateContent('Hi');
                console.log(`✅ Model ${modelName} is AVAILABLE`);
            } catch (err) {
                console.log(`❌ Model ${modelName} call FAILED: ${err.message.split('\n')[0]}`);
            }
        }
    } catch (err) {
        console.error('Test script failed:', err);
    }
}

listModels();
