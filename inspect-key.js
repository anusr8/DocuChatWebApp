const fs = require('fs');
const keyData = JSON.parse(fs.readFileSync('./lifeline-healthcare-484505-ea5984ec564e.json', 'utf8'));
const privateKey = keyData.private_key;

console.log('Private key length:', privateKey.length);
console.log('First 100 chars:', privateKey.substring(0, 100));
console.log('Last 100 chars:', privateKey.substring(privateKey.length - 100));

// Check for literal \n vs actual newlines
const hasLiteralSlashN = privateKey.includes('\\n');
const hasActualNewline = privateKey.includes('\n');

console.log('Has literal \\n:', hasLiteralSlashN);
console.log('Has actual newline:', hasActualNewline);

// Show the characters around the first \n
const index = privateKey.indexOf('\\n');
if (index !== -1) {
    console.log('Chars around index', index, ':', JSON.stringify(privateKey.substring(index - 5, index + 5)));
}
