import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getEmbeddings, generativeModel, getMultimodalEmbedding } from '@/lib/vertex';
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

        // --- NEW: Server-Side Storage Upload via Streaming ---
        console.log('[Upload] Starting server-side storage upload (Streaming) for:', fileName);
        const bucket = adminStorage.bucket();
        const storagePath = `gtm-assets/${Date.now()}-${fileName.replace(/\s+/g, '_')}`;
        const fileRef = bucket.file(storagePath);

        try {
            // Using streaming to avoid ENOBUFS/memory issues with large buffers
            const stream = (file as any).stream();
            const gcsStream = fileRef.createWriteStream({
                metadata: { contentType: file.type || 'application/octet-stream' },
                resumable: true
            });

            await new Promise((resolve, reject) => {
                // @ts-ignore - Web Stream to Node Stream conversion helper
                import('stream').then(m => {
                    const { Readable } = m;
                    Readable.from(stream).pipe(gcsStream)
                        .on('finish', resolve)
                        .on('error', (err: any) => {
                            console.error('[Upload] Stream error:', err);
                            reject(err);
                        });
                }).catch(reject);
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
                if (materialType === 'ppt') {
                    console.log('[Upload] Parsing PPT slides locally using adm-zip...');
                    const [buffer] = await fileRef.download();
                    const AdmZipModule = await import('adm-zip');
                    const AdmZip = AdmZipModule.default || AdmZipModule;
                    const zip = new AdmZip(buffer);
                    const zipEntries = zip.getEntries();
                    
                    // Filter and sort slide XMLs
                    const slideEntries = zipEntries
                        .filter((e: any) => e.entryName.startsWith('ppt/slides/slide') && e.entryName.endsWith('.xml'))
                        .sort((a: any, b: any) => {
                            const n1 = parseInt(a.entryName.match(/\d+/)?.[0] || '0');
                            const n2 = parseInt(b.entryName.match(/\d+/)?.[0] || '0');
                            return n1 - n2;
                        });

                    const numSlides = slideEntries.length;
                    console.log(`[Upload] Manually identified ${numSlides} slides. Processing for Visual Blueprint...`);

                    const processedSlides = [];
                    const CHUNK_SIZE = 8; // Slightly smaller chunks due to larger XML payloads
                    const skipGemini = numSlides > 30; // Increased limit - high-quality indexing is worth the wait
                    
                    if (skipGemini) {
                        console.log('[Upload] INFO: Extremely large file detected. Using basic text indexing to avoid timeout.');
                    }

                    for (let i = 0; i < slideEntries.length; i += CHUNK_SIZE) {
                        const chunk = slideEntries.slice(i, i + CHUNK_SIZE);
                        console.log(`[Upload] Indexing slide batch ${Math.floor(i/CHUNK_SIZE) + 1}/${Math.ceil(numSlides/CHUNK_SIZE)}...`);
                        
                        const chunkResults = await Promise.all(chunk.map(async (entry: any, chunkIdx: number) => {
                            const idx = i + chunkIdx;
                            const fullXml = entry.getData().toString('utf8');
                            
                            // 1. Basic text extraction for fallback
                            const textMatches = fullXml.match(/<a:t>([^<]*)<\/a:t>/g) as string[] | null;
                            const slideRawText = textMatches ? textMatches.map((m: string) => m.replace(/<\/?a:t>/g, '')).join(' ') : '';
                            
                            let visualDescription = slideRawText.slice(0, 1000);
                            
                            // 2. Advanced XML Analysis for the "Visual Blueprint"
                            if (!skipGemini) {
                                try {
                                    // Clean XML to save tokens (remove common namespaces)
                                    const cleanedXml = fullXml
                                        .replace(/xmlns:[^=]+="[^"]+"/g, '')
                                        .replace(/<p:nvSpPr[\s\S]*?<\/p:nvSpPr>/g, '') // Remove non-visual metadata
                                        .slice(0, 5000); // Limit to first 5k chars for prompt safety

                                    const blueprintPrompt = `Analyze this PowerPoint Slide XML and create a high-fidelity "Visual Blueprint" description for image search.
Slide XML:
---
${cleanedXml}
---
Focus on:
1. THE KEY TITLE and specific text content.
2. Layout structure (e.g. "3-column grid", "centered diagram").
3. Specific shapes mentioned (e.g. "arrows connecting 4 circles", "a funnel diagram", "a large table").
4. Visual density and approximate colors/styles inferred from theme tags.
Return a dense, descriptive paragraph that acts as a visual proxy for this slide.`;

                                    const blueprintResult = await generativeModel.generateContent(blueprintPrompt);
                                    visualDescription = (blueprintResult.response.candidates?.[0]?.content?.parts?.[0]?.text || slideRawText).slice(0, 1200);
                                } catch (e) {
                                    console.warn(`[Upload] XML Blueprint failed for slide ${idx + 1}, falling back.`);
                                }
                            }

                            return {
                                slideNumber: idx + 1,
                                description: visualDescription,
                                embedding: await getMultimodalEmbedding({ 
                                    text: `Visual Blueprint: ${visualDescription}`,
                                    taskType: 'RETRIEVAL_DOCUMENT'
                                })
                            };
                        }));
                        processedSlides.push(...chunkResults);
                    }

                    console.log(`[Upload] Successfully processed ${processedSlides.length} slides.`);
                    (req as any)._slides = processedSlides;
                    content = processedSlides.map(s => s.description).join('\n\n');
                }
                
                // Fallback / Word extraction
                if (!content) {
                    const { getTextExtractor } = await import('office-text-extractor');
                    const extractor = getTextExtractor();
                    const [buffer] = await fileRef.download();
                    content = await extractor.extractText({ input: buffer, type: 'buffer' });
                }
            } catch (e) {
                console.error('Office/PPT Extraction Error:', e);
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
            const assetRef = await adminDb.collection('gtm_assets').add({
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

            // 6.1 If PPT slides were processed, save them to a specialized collection
            const slides = (req as any)._slides;
            if (slides && slides.length > 0) {
                console.log(`[Upload] Saving ${slides.length} slides for asset:`, assetRef.id);
                const batch = adminDb.batch();
                slides.forEach((slide: any) => {
                    const slideRef = adminDb.collection('gtm_slides').doc();
                    batch.set(slideRef, {
                        assetId: assetRef.id,
                        assetName: fileName,
                        slideNumber: slide.slideNumber,
                        description: slide.description,
                        multimodal_embedding: FieldValue.vector(slide.embedding),
                        created_at: FieldValue.serverTimestamp()
                    });
                });
                await batch.commit();
            }
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
