import { NextRequest, NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase-admin';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    try {
        const { fileName, contentType, hasThumbnail } = await req.json();

        if (!fileName || !contentType) {
            return NextResponse.json({ error: 'fileName and contentType are required' }, { status: 400 });
        }

        const bucket = adminStorage.bucket();

        // 1. Generate path and Signed URL for the main file
        const uniqueFileName = `${Date.now()}-${fileName.replace(/\s+/g, '_')}`;
        const storagePath = `gtm-assets/${uniqueFileName}`;
        const fileRef = bucket.file(storagePath);

        console.log(`[Presign] Generating write signed URL for file: ${storagePath} (${contentType})`);
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
