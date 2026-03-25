const crypto = require('crypto');
const fs = require('fs');

try {
    const keyData = JSON.parse(fs.readFileSync('./service-account-key.json', 'utf8'));
    const privateKey = keyData.private_key;

    console.log('Attempting to create private key object...');
    const keyObject = crypto.createPrivateKey(privateKey);
    console.log('Key object created successfully!');
    console.log('Key type:', keyObject.type);
    console.log('Key asymmetricType:', keyObject.asymmetricKeyType);

} catch (err) {
    console.error('Crypto test failed:');
    console.error(err);
}
