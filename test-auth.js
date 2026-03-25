const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');

async function testAuth() {
    try {
        console.log('Testing authentication...');
        console.log('Node version:', process.version);
        console.log('Platform:', process.platform);

        const keyData = JSON.parse(fs.readFileSync('./service-account-key.json', 'utf8'));
        const privateKey = keyData.private_key.replace(/\\n/g, '\n');

        const auth = new GoogleAuth({
            credentials: {
                ...keyData,
                private_key: privateKey,
            },
            scopes: 'https://www.googleapis.com/auth/cloud-platform',
        });

        const client = await auth.getClient();
        console.log('Client created successfully.');

        console.log('Attempting to get access token (this involves signing)...');
        const token = await client.getAccessToken();
        console.log('Token acquired successfully!');
        console.log('Token length:', token.token.length);

    } catch (err) {
        console.error('Auth test failed:');
        console.error(err);
        if (err.opensslErrorStack) {
            console.error('OpenSSL error stack:', JSON.stringify(err.opensslErrorStack, null, 2));
        }
    }
}

testAuth();
