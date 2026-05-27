/* ── documentImporter.js — Parse PDF, DOCX, TXT, MD, images ──
 *
 * All parsing happens 100% client-side.
 * No content leaves the device until the user explicitly consents.
 */

// Resolve the worker URL at build time so it works offline (PWA) and
// avoids version mismatches with CDN-hosted workers.
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/* ─── PDF via pdfjs-dist ─────────────────────────────────────────── */
async function parsePdf(file) {
  const pdfjsLib = await import('pdfjs-dist');

  // Point to the locally bundled worker (no CDN, no version mismatch)
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const texts       = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    texts.push(content.items.map(i => i.str).join(' '));
  }

  return {
    text:     texts.join('\n\n'),
    pages:    pdf.numPages,
    wordCount: texts.join(' ').split(/\s+/).filter(Boolean).length,
  };
}

/* ─── DOCX via mammoth ───────────────────────────────────────────── */
async function parseDocx(file) {
  const mammoth     = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result      = await mammoth.extractRawText({ arrayBuffer });

  return {
    text:      result.value,
    pages:     null,
    wordCount: result.value.split(/\s+/).filter(Boolean).length,
  };
}

/* ─── Plain text / Markdown ─────────────────────────────────────── */
async function parsePlainText(file) {
  const text = await file.text();
  return {
    text,
    pages:     null,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  };
}

/* ─── Image (returns base64 for vision) ─────────────────────────── */
async function parseImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve({
      text:      null,
      base64:    reader.result.split(',')[1],
      mimeType:  file.type,
      pages:     1,
      wordCount: 0,
      isImage:   true,
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ─── Main entry point ───────────────────────────────────────────── */

export async function importDocument(file) {
  const name = file.name;
  const ext  = name.split('.').pop().toLowerCase();
  const size = file.size;

  let parsed;

  switch (ext) {
    case 'pdf':
      parsed = await parsePdf(file);
      break;
    case 'docx':
    case 'doc':
      parsed = await parseDocx(file);
      break;
    case 'txt':
    case 'md':
    case 'markdown':
    case 'csv':
      parsed = await parsePlainText(file);
      break;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'gif':
      parsed = await parseImage(file);
      break;
    default:
      // Try as plain text
      try {
        parsed = await parsePlainText(file);
      } catch {
        throw new Error(`Format non supporté : .${ext}`);
      }
  }

  return {
    id:        crypto.randomUUID(),
    name,
    ext,
    size,
    mimeType:  file.type,
    createdAt: new Date().toISOString(),
    ...parsed,
    // Trim very long documents (keep first 100k chars for analysis)
    textPreview: parsed.text ? parsed.text.slice(0, 300) : '',
  };
}

/* ─── Accepted types for file input ────────────────────────────── */
export const ACCEPTED_TYPES = '.pdf,.docx,.doc,.txt,.md,.markdown,.csv,.png,.jpg,.jpeg,.webp';

/* ─── Format file size ───────────────────────────────────────────── */
export function formatFileSize(bytes) {
  if (bytes < 1024)        return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/* ─── Get document type label ───────────────────────────────────── */
export function getDocTypeLabel(ext) {
  const map = {
    pdf: 'PDF', docx: 'Word', doc: 'Word',
    txt: 'Texte', md: 'Markdown', markdown: 'Markdown',
    csv: 'CSV', png: 'Image', jpg: 'Image', jpeg: 'Image',
    webp: 'Image', gif: 'Image',
  };
  return map[ext?.toLowerCase()] ?? ext?.toUpperCase() ?? '?';
}
