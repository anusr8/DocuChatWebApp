const { Storage } = require('@google-cloud/storage');
const path = require('path');

async function fixPublicAccess() {
    const projectId = 'tenxds-agents-idp';
    const bucketName = 'tenxds-agents-idp-docuchat';
    const keyFilename = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');

    const storage = new Storage({ projectId, keyFilename });
    const bucket = storage.bucket(bucketName);

    // Step 1: Set CORS
    console.log('1. Setting CORS...');
    await bucket.setCorsConfiguration([{
        origin: ['*'],
        method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        responseHeader: ['*'],
        maxAgeSeconds: 3600
    }]);
    console.log('   ✅ CORS set.');

    // Step 2: Set bucket-level IAM to allow public reads
    console.log('2. Setting bucket IAM for public reads...');
    try {
        const [policy] = await bucket.iam.getPolicy({ requestedPolicyVersion: 3 });
        policy.version = 3;
        policy.bindings = policy.bindings || [];

        const alreadyPublic = policy.bindings.some(b =>
            b.role === 'roles/storage.objectViewer' &&
            b.members.includes('allUsers')
        );

        if (!alreadyPublic) {
            policy.bindings.push({
                role: 'roles/storage.objectViewer',
                members: ['allUsers'],
            });
            await bucket.iam.setPolicy(policy);
            console.log('   ✅ IAM policy set: allUsers can now read all objects.');
        } else {
            console.log('   ✅ IAM policy already correct.');
        }
    } catch (err) {
        console.error('   ❌ Failed to set IAM policy:', err.message);
        console.error('   This may require manual setup in Google Cloud Console:');
        console.error('   Storage > Buckets > tenxds-agents-idp-docuchat > Permissions > Grant Access');
        console.error('   Member: allUsers, Role: Storage Object Viewer');
    }
}

fixPublicAccess();
