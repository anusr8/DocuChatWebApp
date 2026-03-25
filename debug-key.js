const fs = require('fs');
const keyData = JSON.parse(fs.readFileSync('./lifeline-healthcare-484505-ea5984ec564e.json', 'utf8'));
const privateKey = keyData.private_key;

console.log('--- RAW STRING START ---');
console.log(JSON.stringify(privateKey));
console.log('--- RAW STRING END ---');

// Check for specific issues
const lines = privateKey.split(/\r?\n/);
console.log('Number of actual lines:', lines.length);

for (let i = 0; i < Math.min(lines.length, 5); i++) {
    console.log(`Line ${i} length: ${lines[i].length}, content: ${JSON.stringify(lines[i])}`);
}

// Check for any non-base64 characters in the middle
const base64Part = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

console.log('Base64-only part length:', base64Part.length);
if (/[^A-Za-z0-9+/=]/.test(base64Part)) {
    console.log('Found INVALID characters in base64 part:', base64Part.match(/[^A-Za-z0-9+/=]/g).slice(0, 10));
}
