import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import path from 'path';

export const maxDuration = 60;

// Build a dedicated @google-cloud/storage client that can sign URLs.
// On Vercel, the Credentials/ folder is not deployed, so we MUST read
// the service account from the FIREBASE_SERVICE_ACCOUNT_JSON env var.
function getGCSClient(): Storage {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
        const credentials = JSON.parse(serviceAccountJson);
        return new Storage({
            projectId: credentials.project_id,
            credentials,
        });
    }
    // Local fallback: use the service account key file
    const keyFilename = path.resolve(process.cwd(), 'Credentials', 'google-service-account.json');
    return new Storage({ keyFilename });
}

export async function POST(req: NextRequest) {
    try {
        const { fileName, contentType, hasThumbnail } = await req.json();

        if (!fileName || !contentType) {
            return NextResponse.json({ error: 'fileName and contentType are required' }, { status: 400 });
        }

        const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '';
        const gcs = getGCSClient();
        const bucket = gcs.bucket(bucketName);

        // 1. Generate path and Signed URL for the main file
        const uniqueFileName = `${Date.now()}-${fileName.replace(/\s+/g, '_')}`;
        const storagePath = `gtm-assets/${uniqueFileName}`;
        const fileRef = bucket.file(storagePath);

        console.log(`[Presign] Generating write signed URL for: ${storagePath} (${contentType})`);
        const [fileUploadUrl] = await fileRef.getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
            contentType: contentType,
        });

        // 2. Generate path and Signed URL for the thumbnail if applicable
        let thumbnailUploadUrl = null;
        let thumbnailPath = null;

        if (hasThumbnail) {
            const thumbnailName = `thumb-${Date.now()}-${fileName.split('.')[0]}.jpg`;
            thumbnailPath = `gtm-assets/thumbnails/${thumbnailName}`;
            const thumbRef = bucket.file(thumbnailPath);

            console.log(`[Presign] Generating write signed URL for thumbnail: ${thumbnailPath}`);
            [thumbnailUploadUrl] = await thumbRef.getSignedUrl({
                version: 'v4',
                action: 'write',
                expires: Date.now() + 15 * 60 * 1000, // 15 minutes
                contentType: 'image/jpeg',
            });
        }

        return NextResponse.json({
            fileUploadUrl,
            storagePath,
            thumbnailUploadUrl,
            thumbnailPath,
        });
    } catch (error: any) {
        console.error('[Presign Route Error]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
