const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkSchema() {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    const getVal = (key) => {
        const match = envContent.match(new RegExp(`${key}=(.*)`));
        return match ? match[1].trim() : null;
    };

    const supabaseUrl = getVal('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseServiceKey = getVal('SUPABASE_SERVICE_ROLE_KEY');

    console.log('Fetching OpenAPI spec from Supabase...');
    try {
        const response = await fetch(`${supabaseUrl}/rest/v1/?apikey=${supabaseServiceKey}`);
        const spec = await response.json();

        if (spec.definitions && spec.definitions.document_embeddings) {
            console.log('--- document_embeddings schema ---');
            console.log(Object.keys(spec.definitions.document_embeddings.properties));
        } else {
            console.log('document_embeddings definition not found in spec.');
            console.log('Available definitions:', Object.keys(spec.definitions || {}));
        }

        if (spec.definitions && spec.definitions.documents) {
            console.log('--- documents schema ---');
            console.log(Object.keys(spec.definitions.documents.properties));
        }
    } catch (err) {
        console.error('Fetch failed:', err.message);
    }
}

checkSchema();
