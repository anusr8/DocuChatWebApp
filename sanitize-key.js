const fs = require('fs');
const crypto = require('crypto');

async function sanitizeAndTest() {
    try {
        const keyData = JSON.parse(fs.readFileSync('./lifeline-healthcare-484505-ea5984ec564e.json', 'utf8'));
        let rawKey = keyData.private_key;

        // Extract the base64 part
        const match = rawKey.match(/-----BEGIN PRIVATE KEY-----([\s\S]*)-----END PRIVATE KEY-----/);
        if (!match) {
            console.error('Could not find PEM boundaries');
            return;
        }

        const base64 = match[1].replace(/\s/g, '');
        console.log('Cleaned base64 length:', base64.length);

        const cleanPem = `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;

        console.log('Attempting to parse cleaned PEM...');
        try {
            const keyObject = crypto.createPrivateKey(cleanPem);
            console.log('SUCCESS! Cleaned key is valid.');
            console.log('Key type:', keyObject.type);

            // If valid, write it back to service-account-key.json
            keyData.private_key = cleanPem;
            fs.writeFileSync('./service-account-key.json', JSON.stringify(keyData, null, 2));
            console.log('Updated service-account-key.json with cleaned key.');
        } catch (err) {
            console.error('Cleaned key is STILL invalid:');
            console.error(err.message);
            if (err.opensslErrorStack) {
                console.error('Stack:', err.opensslErrorStack);
            }
        }

    } catch (err) {
        console.error('Sanitize script failed:');
        console.error(err);
    }
}

sanitizeAndTest();
