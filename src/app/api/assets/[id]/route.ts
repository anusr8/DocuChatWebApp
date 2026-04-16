import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-admin';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const p = await params;
        const id = p.id;
        console.log(`[Delete] Received request for ID: ${id}`, p);

        if (!id) {
            console.error('[Delete] No ID found in params');
            return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
        }

        // 1. Fetch asset to get storage paths
        const assetDoc = await adminDb.collection('gtm_assets').doc(id).get();
        if (!assetDoc.exists) {
            return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
        }

        const assetData = assetDoc.data()!;
        const publicUrl = assetData.url;
        const thumbnail_url = assetData.thumbnail_url;

        // 2. Delete slides first (gtm_slides)
        console.log(`[Delete] Cleaning up slides for asset: ${id}`);
        const slidesSnapshot = await adminDb.collection('gtm_slides')
            .where('assetId', '==', id)
            .get();
        
        if (!slidesSnapshot.empty) {
            const batch = adminDb.batch();
            slidesSnapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
            await batch.commit();
            console.log(`[Delete] Removed ${slidesSnapshot.size} slides.`);
        }

        // 3. Delete files from Storage
        const bucket = adminStorage.bucket();
        
        // Helper to extract path from GCS public URL or just assume gtm-assets/
        // A more robust way is to store the storagePath during upload, but we can reconstruct it.
        const extractPath = (url: string) => {
            if (!url || url === '#') return null;
            try {
                const parts = url.split(`${bucket.name}/`);
                if (parts.length > 1) return parts[1];
            } catch (err: any) { console.error('Path extraction failed', err); }
            return null;
        };

        const storagePath = extractPath(publicUrl);
        if (storagePath) {
            await bucket.file(storagePath).delete().catch((err: any) => console.warn(`[Delete] Main file not found in storage: ${storagePath}`));
        }

        const thumbPath = extractPath(thumbnail_url);
        if (thumbPath) {
            await bucket.file(thumbPath).delete().catch((err: any) => console.warn(`[Delete] Thumbnail not found in storage: ${thumbPath}`));
        }

        // 4. Delete the asset document
        await adminDb.collection('gtm_assets').doc(id).delete();
        console.log(`[Delete] Asset ${id} deleted successfully.`);

        return NextResponse.json({ message: 'Asset deleted successfully' });
    } catch (error: any) {
        console.error('[Delete] Handler error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
