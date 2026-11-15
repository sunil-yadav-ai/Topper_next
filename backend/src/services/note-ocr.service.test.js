import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

process.env.OCR_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.GEMINI_API_KEY = "test-api-key";
process.env.GEMINI_OCR_MODEL = "test-ocr-model";
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";
import {
  geminiJsonResponse,
  isGeminiRequest,
  mockGeminiUsage,
} from "../test/gemini-test-helpers.js";
const {
  decryptOcrResult,
  encryptOcrResult,
  extractNoteText,
  splitPdfIntoPages,
} = await import("./note-ocr.service.js");

test("splits PDFs into individually numbered pages", async () => {
  const source = await PDFDocument.create();
  source.addPage([612, 792]);
  source.addPage([792, 612]);

  const pages = await splitPdfIntoPages(Buffer.from(await source.save()));

  assert.deepEqual(pages.map((page) => page.pageNumber), [1, 2]);
  assert.equal(pages[0].mimeType, "application/pdf");
  assert.equal((await PDFDocument.load(pages[0].bytes)).getPageCount(), 1);
  assert.equal((await PDFDocument.load(pages[1].bytes)).getPageCount(), 1);
});

test("rejects stored notes over the processing size limit", async () => {
  const originalFetch = globalThis.fetch;
  const oversizedPdf = Buffer.concat([
    Buffer.from("%PDF-1.7"),
    Buffer.alloc(10 * 1024 * 1024),
  ]);
  globalThis.fetch = async () => new Response(oversizedPdf, { status: 200 });

  try {
    await assert.rejects(
      extractNoteText({
        uploadedBy: "507f1f77bcf86cd799439011",
        storage: {
          provider: "cloudinary",
          publicId: "test/large-note",
          resourceType: "raw",
          format: "pdf",
          mimeType: "application/pdf",
          bytes: oversizedPdf.length,
        },
      }),
      /exceeds the 10 MB processing limit/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("encrypts OCR output and rejects ciphertext tampering", () => {
  const result = {
    pages: [
      {
        pageNumber: 1,
        extractedText: "x + [unclear]",
        recognizedFormulas: ["x + 1 = 2"],
        readabilityStatus: "partially_readable",
        ocrConfidence: 0.72,
        unclearRegions: ["line 2"],
      },
    ],
  };
  const encrypted = encryptOcrResult(result);

  assert.notEqual(encrypted.ciphertext, JSON.stringify(result));
  assert.deepEqual(decryptOcrResult(encrypted), result);
  assert.throws(() =>
    decryptOcrResult({
      ...encrypted,
      ciphertext: Buffer.from("tampered").toString("base64"),
    }),
  );
});

test("sends each PDF page separately and preserves structured OCR output", async (t) => {
  mockGeminiUsage(t);
  const source = await PDFDocument.create();
  source.addPage([612, 792]);
  source.addPage([792, 612]);
  const pdfBytes = Buffer.from(await source.save());
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    if (isGeminiRequest(url)) {
      const request = JSON.parse(options.body);
      requests.push(request);
      const file = request.contents[0].parts[1].inlineData;
      assert.equal(file.mimeType, "application/pdf");
      assert.ok(file.data);
      return geminiJsonResponse({
        pageNumber: requests.length,
        extractedText: `Page ${requests.length}`,
        recognizedFormulas: ["x + 1 = 2"],
        readabilityStatus: "readable",
        ocrConfidence: 0.94,
        unclearRegions: [],
      });
    }

    return new Response(pdfBytes, { status: 200 });
  };

  try {
    const result = await extractNoteText({
      uploadedBy: "507f1f77bcf86cd799439011",
      storage: {
        provider: "cloudinary",
        publicId: "test/note",
        resourceType: "raw",
        format: "pdf",
        mimeType: "application/pdf",
        bytes: pdfBytes.length,
      },
    });

    assert.equal(requests.length, 2);
    assert.deepEqual(result.pages.map((page) => page.pageNumber), [1, 2]);
    assert.deepEqual(result.pages.map((page) => page.extractedText), ["Page 1", "Page 2"]);
    assert.deepEqual(result.pages[0].recognizedFormulas, ["x + 1 = 2"]);
    assert.equal(requests[0].generationConfig.responseMimeType, "application/json");
    assert.equal(requests[0].generationConfig.responseJsonSchema.properties.pageNumber.type, "integer");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("surfaces Gemini failures without storing a success-shaped OCR result", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) =>
    isGeminiRequest(url)
      ? Response.json({ error: { message: "service unavailable" } }, { status: 503 })
      : new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { status: 200 });

  try {
    await assert.rejects(
      extractNoteText({
        uploadedBy: "507f1f77bcf86cd799439011",
        storage: {
          provider: "cloudinary",
          publicId: "test/note",
          resourceType: "image",
          format: "jpg",
          mimeType: "image/jpeg",
          bytes: 4,
        },
      }),
      /AI service is temporarily unavailable/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not retry Gemini requests internally when rate limited", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url) =>
    isGeminiRequest(url)
      ? (++requests, Response.json(
          { error: { message: "Rate limit exceeded; retry in 2s" } },
          { status: 429 },
        ))
      : new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { status: 200 });

  try {
    await assert.rejects(
      extractNoteText({
        uploadedBy: "507f1f77bcf86cd799439011",
        storage: {
          provider: "cloudinary",
          publicId: "test/note",
          resourceType: "image",
          format: "jpg",
          mimeType: "image/jpeg",
          bytes: 4,
        },
      }),
      (error) => {
        assert.match(error.message, /receiving requests too quickly/i);
        assert.equal(error.retryAfterMs, 2000);
        return true;
      },
    );
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("identifies exhausted Gemini daily quota as non-retryable", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  let responseBody = { error: { message: "Rate limit exceeded" } };
  globalThis.fetch = async (url) =>
    isGeminiRequest(url)
      ? Response.json(responseBody, { status: 429 })
      : new Response(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), { status: 200 });

  const note = {
    uploadedBy: "507f1f77bcf86cd799439011",
    storage: {
      provider: "cloudinary",
      publicId: "test/note",
      resourceType: "image",
      format: "jpg",
      mimeType: "image/jpeg",
      bytes: 4,
    },
  };

  try {
    await assert.rejects(extractNoteText(note), (error) => {
      assert.equal(error.retryableRateLimit, true);
      assert.equal(error.providerErrorCode, "RATE_LIMIT");
      return true;
    });

    responseBody = { error: { message: "Daily quota exhausted for today" } };
    await assert.rejects(extractNoteText(note), (error) => {
      assert.equal(error.retryableRateLimit, false);
      assert.equal(error.providerErrorCode, "RESOURCE_EXHAUSTED");
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
