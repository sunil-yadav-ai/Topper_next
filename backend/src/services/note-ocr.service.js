import { PDFDocument } from "pdf-lib";
import { decryptJson, encryptJson } from "./encrypted-json.service.js";
import { generateStructuredContent } from "./gemini-ai.service.js";
import { getPrivateNoteDownloadUrl } from "./note-storage.service.js";

const maxPdfPages = 100;
const pageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    pageNumber: { type: "integer", minimum: 1 },
    extractedText: { type: "string" },
    recognizedFormulas: { type: "array", items: { type: "string" } },
    readabilityStatus: {
      type: "string",
      enum: ["readable", "partially_readable", "unreadable"],
    },
    ocrConfidence: { type: "number", minimum: 0, maximum: 1 },
    unclearRegions: { type: "array", items: { type: "string" } },
  },
  required: [
    "pageNumber",
    "extractedText",
    "recognizedFormulas",
    "readabilityStatus",
    "ocrConfidence",
    "unclearRegions",
  ],
};

export const decryptOcrResult = decryptJson;

async function getSourceFile(note) {
  if (note.storage.provider !== "cloudinary") {
    throw new Error("The note uses an unsupported storage provider.");
  }
  const response = await fetch(getPrivateNoteDownloadUrl(note.storage), {
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    throw new Error(`Could not download the stored note (HTTP ${response.status}).`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length === 0 || data.length > 10 * 1024 * 1024) {
    throw new Error("Stored note is empty or exceeds the 10 MB processing limit.");
  }
  return data;
}

export async function splitPdfIntoPages(pdfBytes) {
  const source = await PDFDocument.load(pdfBytes);
  const pageCount = source.getPageCount();
  if (pageCount === 0 || pageCount > maxPdfPages) {
    throw new Error(`PDFs must contain between 1 and ${maxPdfPages} pages.`);
  }

  const pages = [];
  for (let index = 0; index < pageCount; index += 1) {
    const singlePage = await PDFDocument.create();
    const [page] = await singlePage.copyPages(source, [index]);
    singlePage.addPage(page);
    pages.push({
      pageNumber: index + 1,
      mimeType: "application/pdf",
      bytes: Buffer.from(await singlePage.save()),
    });
  }
  return pages;
}

async function callVisionModel(page, userId) {
  const instruction =
    "Read this handwritten academic-notes page. Transcribe only text you can actually read; " +
    "do not guess, correct, or complete unclear words, formulas, or statements. " +
    "Mark unclear handwriting in unclearRegions, use [unclear] in extractedText where needed, " +
    "and set readabilityStatus to unreadable if the handwriting cannot be reliably read. " +
    "Uncertainty is not evidence that the author is wrong. Identify mathematical formulas " +
    "separately in recognizedFormulas, preserving their notation as closely as possible. " +
    `This is source page ${page.pageNumber}; return that exact pageNumber. ` +
    "Set ocrConfidence between 0 (no confidence) and 1 (high confidence) for the page transcription.";
  if (!["application/pdf", "image/jpeg", "image/png"].includes(page.mimeType)) {
    const error = new Error("The stored note uses an unsupported file format.");
    error.statusCode = 415;
    error.expose = true;
    throw error;
  }

  const { result } = await generateStructuredContent({
    feature: "ocr",
    userId,
    contents: [{
      role: "user",
      parts: [
        { text: instruction },
        {
          inlineData: {
            mimeType: page.mimeType,
            data: page.bytes.toString("base64"),
          },
        },
      ],
    }],
    schema: pageSchema,
    maxOutputTokens: 3000,
    timeoutMs: 90_000,
  });
  if (
    result.pageNumber !== page.pageNumber ||
    typeof result.extractedText !== "string" ||
    !Array.isArray(result.recognizedFormulas) ||
    !["readable", "partially_readable", "unreadable"].includes(result.readabilityStatus) ||
    !Number.isFinite(result.ocrConfidence) ||
    result.ocrConfidence < 0 ||
    result.ocrConfidence > 1 ||
    !Array.isArray(result.unclearRegions)
  ) {
    const error = new Error(`AI service returned invalid OCR for page ${page.pageNumber}.`);
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }
  return result;
}

export async function extractNoteText(note, beforePage, userId = note.uploadedBy) {
  const source = await getSourceFile(note);
  const pages =
    note.storage.format === "pdf"
      ? await splitPdfIntoPages(source)
      : [
          {
            pageNumber: 1,
            mimeType: note.storage.mimeType,
            bytes: source,
          },
        ];

  const result = [];
  for (const page of pages) {
    if (beforePage) await beforePage();
    result.push(await callVisionModel(page, userId));
  }

  return { pages: result };
}

export function encryptOcrResult(result) {
  return encryptJson(result);
}
