import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { getPrivateNoteDownloadUrl, uploadNotePreview } from "./note-storage.service.js";

const require = createRequire(import.meta.url);
GlobalWorkerOptions.workerSrc = pathToFileURL(
  require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

const previewWidth = 480;
const previewHeight = 640;
const maximumPdfBytes = 10 * 1024 * 1024;
const pendingPreviews = new Map();

export async function renderPdfFirstPagePreview(pdfBuffer) {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0 || pdfBuffer.length > maximumPdfBytes) {
    throw new Error("The note PDF is empty or exceeds the preview size limit.");
  }

  const document = await getDocument({
    data: new Uint8Array(pdfBuffer),
    isEvalSupported: false,
  }).promise;

  try {
    const page = await document.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      1,
      previewWidth / baseViewport.width,
      previewHeight / baseViewport.height,
    );
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(
      Math.max(1, Math.ceil(viewport.width)),
      Math.max(1, Math.ceil(viewport.height)),
    );

    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
    }).promise;

    return canvas.toBuffer("image/png");
  } finally {
    await document.cleanup();
  }
}

async function generateNotePreview(note) {
  if (note.storage.bytes > maximumPdfBytes) {
    throw new Error("The note PDF exceeds the preview size limit.");
  }

  const response = await fetch(getPrivateNoteDownloadUrl(note.storage), {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Could not download note PDF for preview (HTTP ${response.status}).`);
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumPdfBytes) {
    throw new Error("The note PDF exceeds the preview size limit.");
  }

  const pdfBuffer = Buffer.from(await response.arrayBuffer());
  const previewBuffer = await renderPdfFirstPagePreview(pdfBuffer);
  const previewStorage = await uploadNotePreview(previewBuffer);
  note.previewStorage = previewStorage;
  await note.save();
  return previewStorage;
}

export function ensureNotePreview(note) {
  if (note.previewStorage?.publicId || note.storage.format !== "pdf") {
    return Promise.resolve(note.previewStorage?.publicId ? note.previewStorage : null);
  }

  const key = note._id.toString();
  if (!pendingPreviews.has(key)) {
    const pending = generateNotePreview(note).finally(() => {
      pendingPreviews.delete(key);
    });
    pendingPreviews.set(key, pending);
  }

  return pendingPreviews.get(key).then((previewStorage) => {
    if (previewStorage) note.previewStorage = previewStorage;
    return previewStorage;
  });
}
