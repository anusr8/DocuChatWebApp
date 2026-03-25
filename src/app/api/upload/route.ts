import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getEmbeddings, generativeModel } from '@/lib/vertex';
// Global cache for resource readiness
let isResourcesReady = true;

/**
 * NOTE: ensureResourcesReady is currently disabled to prevent hangs.
 * Resource initialization (Buckets, Indexes) should be done via admin scripts or directly in the Console.
 */
async function ensureResourcesReady(projectId: string, bucketName: string) {
    console.log('[Upload] Resource check is currently a no-op.');
}
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const fileName = formData.get('fileName') as string;
        const thumbnailFile = formData.get('thumbnail') as File | null;
        const materialType = formData.get('materialType') as string;

        if (!file || !fileName || !materialType) {
            return NextResponse.json({ error: 'File, File Name and Material Type are required' }, { status: 400 });
        }

        const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '';
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';

        // --- NEW: Server-Side Storage Upload ---
        console.log('[Upload] Starting server-side storage upload for:', fileName);
        const bucket = adminStorage.bucket();
        const storagePath = `gtm-assets/${Date.now()}-${fileName.replace(/\s+/g, '_')}`;
        const fileRef = bucket.file(storagePath);

        try {
            const buffer = Buffer.from(await file.arrayBuffer());
            await fileRef.save(buffer, {
                metadata: { contentType: file.type || 'application/octet-stream' }
            });
            console.log('[Upload] Server-side storage upload successful:', storagePath);
        } catch (uploadError: any) {
            console.error('[Upload] Server-side storage upload failed:', uploadError);
            return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
        }

        const gsUri = `gs://${bucketName}/${storagePath}`;
        // Use the standard GCS public URL (works when file is public)
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${storagePath}`;

        // 2. Handle Thumbnail Upload (Already uploaded to Storage by client if we wanted, or kept as is)

        // 2.1 Handle Thumbnail Upload
        let thumbnail_url = null;
        if (thumbnailFile) {
            const thumbnailName = `thumb-${Date.now()}-${fileName.split('.')[0]}.jpg`;
            const thumbRef = bucket.file(`gtm-assets/thumbnails/${thumbnailName}`);
            try {
                const thumbBuffer = Buffer.from(await thumbnailFile.arrayBuffer());
                await thumbRef.save(thumbBuffer, {
                    metadata: { contentType: 'image/jpeg' }
                });
                thumbnail_url = `https://storage.googleapis.com/${bucket.name}/${thumbRef.name}`;
            } catch (thumbError) {
                console.error('Thumbnail upload error', thumbError);
            }
        }

        // 3. Extract Text & Generate Embedding
        console.time('[Upload] Text Extraction');
        let content = '';
        const [metadata] = await fileRef.getMetadata();
        const mimeType = metadata.contentType || 'application/octet-stream';

        if (materialType === 'pdf') {
            try {
                // Use Gemini via GCS URI for PDFs (Large file support + native document AI)
                console.log('[Upload] Using Gemini GCS-native extraction for PDF:', fileName);
                const result = await generativeModel.generateContent({
                    contents: [{
                        role: 'user',
                        parts: [
                            { text: "Please extract the full text of this PDF. Focus on Go-To-Market (GTM) content." },
                            { fileData: { fileUri: gsUri, mimeType: 'application/pdf' } }
                        ]
                    }]
                });
                content = result.response.candidates?.[0]?.content?.parts?.[0]?.text || fileName;
            } catch (e) {
                console.error('Gemini PDF Parsing Error:', e);
                // Fallback to local parsing if Gemini fails
                try {
                    const pdf = require('pdf-parse/lib/pdf-parse.js');
                    const [buffer] = await fileRef.download();
                    const data = await pdf(buffer);
                    content = data.text;
                } catch (fallbackError) {
                    console.error('PDF Fallback Parse Error:', fallbackError);
                    content = fileName;
                }
            }
        } else if (materialType === 'word' || materialType === 'ppt') {
            try {
                const { getTextExtractor } = await import('office-text-extractor');
                const extractor = getTextExtractor();
                const [buffer] = await fileRef.download();
                content = await extractor.extractText({ input: buffer, type: 'buffer' });
            } catch (e) {
                console.error('Office Extraction Error:', e);
                content = `File: ${fileName}. Extraction failed.`;
            }
        } else if (materialType === 'video' || materialType === 'audio') {
            // Use Gemini for Video/Audio via GCS URI (No local memory limit)
            try {
                const prompt = materialType === 'video'
                    ? "Please transcribe and summarize the key Go-To-Market (GTM) points from this video. Focus on the product features, value proposition, and strategy mentioned."
                    : "Please transcribe and summarize the key Go-To-Market (GTM) points from this audio file. Focus on the product features, value proposition, and strategy mentioned.";

                const result = await generativeModel.generateContent({
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: prompt },
                                {
                                    fileData: {
                                        fileUri: gsUri,
                                        mimeType: mimeType
                                    }
                                }
                            ]
                        }
                    ]
                });

                content = result.response.candidates?.[0]?.content?.parts?.[0]?.text || `File: ${fileName}. Transcription returned empty.`;
            } catch (e) {
                console.error('Gemini GCS Parsing Error:', e);
                content = `File: ${fileName}. Parsing failed.`;
            }
        }
        console.timeEnd('[Upload] Text Extraction');

        // 4. Generate AI Metadata (Detailed Summary, Category & Tags)
        console.time('[Upload] Metadata Generation');
        const truncatedContent = content.slice(0, 10000);
        let category = 'Uncategorized';
        let tags: string[] = [];
        let summary = '';

        try {
            const metadataPrompt = `Analyze the following GTM document and generate high-quality metadata.
YOUR GOAL: Create a "Semantic Bridge" summary that captures every important detail, value proposition, and technical strategy so that a vector search can find this document easily.

1. A COMPREHENSIVE SUMMARY: (200-300 words) Capture the core message, target audience, key features, and unique value propositions.
2. ONE PRIMARY CATEGORY: (e.g., Marketing, Sales, Strategy, Technical, Finance, Legal, etc.)
3. RELEVANT TAGS: (Exactly 5 tags as a comma-separated list).

Respond ONLY in the following JSON format:
{
  "summary": "Detailed summary here...",
  "category": "category name",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Content:
${truncatedContent.slice(0, 5000)}`;

            const metadataResult = await generativeModel.generateContent(metadataPrompt);
            const metadataResponse = metadataResult.response;
            const metadataText = metadataResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';

            const jsonMatch = metadataText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const metadata = JSON.parse(jsonMatch[0]);
                summary = metadata.summary || '';
                category = metadata.category || 'Uncategorized';
                tags = Array.isArray(metadata.tags) ? metadata.tags : [];
            }
        } catch (e) {
            console.error('Metadata Generation Error:', e);
            summary = truncatedContent.slice(0, 300) + '...';
        }
        console.timeEnd('[Upload] Metadata Generation');

        // 5. Generate Dual Embeddings
        console.time('[Upload] Embedding Generation');
        // Full Content Embedding for deep search (Home Chat)
        // Metadata Embedding for quick relevancy (Explore Page)
        const metadataSearchText = `Document Name: ${fileName}\nSummary: ${summary}`;

        const [fullEmbeddings, metadataEmbeddings] = await Promise.all([
            getEmbeddings([truncatedContent]),
            getEmbeddings([metadataSearchText])
        ]);

        const embedding = fullEmbeddings[0]; // Full content
        const metadataEmbedding = metadataEmbeddings[0]; // Name + Summary

        // 6. Insert into unified Firestore collection
        try {
            await adminDb.collection('gtm_assets').add({
                content: truncatedContent,
                summary: summary,
                embedding: FieldValue.vector(embedding),
                metadata_embedding: FieldValue.vector(metadataEmbedding),
                name: fileName,
                url: publicUrl,
                category: category,
                tags: tags,
                thumbnail_url: thumbnail_url,
                type: materialType === 'word' ? 'Word' : materialType === 'ppt' ? 'PPT' : materialType === 'pdf' ? 'PDF' : materialType === 'video' ? 'Video' : 'Audio',
                created_at: FieldValue.serverTimestamp()
            });
        } catch (dbError: any) {
            console.error('Firestore insert error:', dbError);
            throw dbError;
        }
        console.timeEnd('[Upload] Embedding Generation');

        return NextResponse.json({ message: 'Success', url: publicUrl });
    } catch (error: any) {
        console.error('Upload handler error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let i = 0;
    while (i < text.length) {
        chunks.push(text.slice(i, i + chunkSize));
        i += chunkSize - overlap;
    }
    return chunks;
}
