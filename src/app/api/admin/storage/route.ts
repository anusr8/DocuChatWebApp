import { NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase-admin';
import { getSessionFromRequest } from '@/lib/auth-token';

export async function GET(request: Request) {
  try {
    // Verify JWT session and admin role
    const session = getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: valid session required' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const bucket = adminStorage.bucket();
    // Fetch all files in the bucket under gtm-assets/ prefix
    const [files] = await bucket.getFiles({ prefix: 'gtm-assets/' });

    let totalSize = 0;
    let totalFiles = 0;
    const typeBreakdown: Record<string, { count: number; size: number }> = {
      pdf: { count: 0, size: 0 },
      ppt: { count: 0, size: 0 },
      word: { count: 0, size: 0 },
      video: { count: 0, size: 0 },
      audio: { count: 0, size: 0 },
      image: { count: 0, size: 0 },
      other: { count: 0, size: 0 }
    };

    files.forEach((file: any) => {
      // Skip directory objects
      if (file.name.endsWith('/')) return;

      // Skip thumbnails to count primary GTM assets
      if (file.name.includes('/thumbnails/')) return;

      const size = parseInt(file.metadata.size || '0', 10);
      totalSize += size;
      totalFiles++;

      // Identify type by extension
      const ext = file.name.toLowerCase().split('.').pop() || '';
      let type = 'other';
      if (ext === 'pdf') {
        type = 'pdf';
      } else if (['ppt', 'pptx'].includes(ext)) {
        type = 'ppt';
      } else if (['doc', 'docx'].includes(ext)) {
        type = 'word';
      } else if (['mp4', 'mov', 'avi'].includes(ext)) {
        type = 'video';
      } else if (['mp3', 'wav', 'm4a', 'aac'].includes(ext)) {
        type = 'audio';
      } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
        type = 'image';
      }

      typeBreakdown[type].count++;
      typeBreakdown[type].size += size;
    });

    return NextResponse.json({
      totalFiles,
      totalSize,
      typeBreakdown
    });
  } catch (error: any) {
    console.error('[Admin Storage API Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
