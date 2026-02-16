// Lazy-loaded PDF renderer using pdf.js
// Only imported when a PDF image is actually encountered

const PDFJS_VERSION = "5.4.624";
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`;

let pdfjsLib = null;

async function getPdfjs() {
  if (!pdfjsLib) {
    // Import worker first to register on globalThis.pdfjsWorker,
    // enabling main-thread processing without a Web Worker.
    // Use CDN URLs so consumers don't need to configure anything.
    await import(/* @vite-ignore */ `${PDFJS_CDN}/pdf.worker.mjs`);
    pdfjsLib = await import(/* @vite-ignore */ `${PDFJS_CDN}/pdf.mjs`);
  }

  return pdfjsLib;
}

/**
 * Render PDF page 1 to a PNG blob URL
 * @param {string} base64Data - Base64 encoded PDF data
 * @returns {Promise<{ blobUrl: string, naturalWidth: number, naturalHeight: number }>}
 */
export async function renderPdfToImage(base64Data) {
  const pdfjs = await getPdfjs();

  const byteString = atob(base64Data);
  const bytes = new Uint8Array(byteString.length);

  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }

  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const blobUrl = URL.createObjectURL(blob);

  pdf.destroy();

  return {
    blobUrl,
    naturalWidth: viewport.width,
    naturalHeight: viewport.height,
  };
}
