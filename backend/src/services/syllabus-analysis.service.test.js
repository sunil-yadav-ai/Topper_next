import assert from "node:assert/strict";
import test from "node:test";
import { StandardFonts, PDFDocument } from "pdf-lib";

process.env.GEMINI_API_KEY = "test-api-key";
process.env.GEMINI_SYLLABUS_MODEL = "test-syllabus-model";
import {
  geminiJsonResponse,
  isGeminiRequest,
  mockGeminiUsage,
} from "../test/gemini-test-helpers.js";
const {
  extractAndOrganizeSyllabus,
  normalizeSyllabusStructure,
  organizeSyllabusPages,
  splitSyllabusPdfIntoPages,
  validateSyllabusFile,
} = await import("./syllabus-analysis.service.js");
const { topicMatchesResource } = await import("./syllabus-resource.service.js");

const onePageSyllabus = {
  course: "BCA",
  semester: 5,
  subjects: [
    {
      subjectName: "Calculus",
      subjectCode: "BCA-501",
      units: [
        {
          unitNumber: 1,
          unitTitle: "Differentiation",
          topics: [{ topicName: "Chain rule", subtopics: ["Implicit differentiation"] }],
        },
      ],
    },
  ],
};
const testUserId = "507f1f77bcf86cd799439011";

test("validates syllabus extensions, MIME types, and file signatures", () => {
  assert.deepEqual(
    validateSyllabusFile({
      originalname: "course.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF-1.7"),
    }),
    { format: "pdf", mimeType: "application/pdf" },
  );
  assert.throws(
    () =>
      validateSyllabusFile({
        originalname: "course.pdf",
        mimetype: "image/png",
        buffer: Buffer.from("%PDF-1.7"),
      }),
    /PDF, JPG, JPEG, or PNG/,
  );
  assert.throws(
    () =>
      validateSyllabusFile({
        originalname: "course.png",
        mimetype: "image/png",
        buffer: Buffer.from("not an image"),
      }),
    /contents do not match/,
  );
  assert.throws(
      () =>
        validateSyllabusFile({
          originalname: "large.pdf",
          mimetype: "application/pdf",
          buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
        }),
      /between 1 byte and 10 MB/,
  );
});

test("splits syllabus PDFs into individually numbered source pages", async () => {
  const document = await PDFDocument.create();
  document.addPage();
  document.addPage();
  const pages = await splitSyllabusPdfIntoPages(Buffer.from(await document.save()));
  assert.deepEqual(pages.map((page) => page.pageNumber), [1, 2]);
  assert.ok(pages.every((page) => page.mimeType === "application/pdf"));
});

test("rejects syllabus PDFs above the supported page limit", async () => {
  const document = await PDFDocument.create();
  for (let pageNumber = 0; pageNumber < 51; pageNumber += 1) {
    document.addPage();
  }
  await assert.rejects(
    splitSyllabusPdfIntoPages(Buffer.from(await document.save())),
    /between 1 and 50 pages/,
  );
});

test("normalizes student-confirmed structure and rejects invalid topic names", () => {
  assert.deepEqual(
    normalizeSyllabusStructure(onePageSyllabus),
    onePageSyllabus,
  );
  assert.throws(
    () =>
      normalizeSyllabusStructure({
        subjects: [{ name: "Calculus", units: [{ name: "Unit 1", topics: [{ name: "", subtopics: [] }] }] }],
      }),
    /Topic names must contain/,
  );
  assert.throws(
    () =>
      normalizeSyllabusStructure({
        subjects: [{ subjectName: "Calculus", units: [] }],
      }),
    /Each subject must contain between 1 and 40 units/,
  );
});

test("uses backend Gemini OCR and structured syllabus extraction", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  const requests = [];
  const requestUrls = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(isGeminiRequest(url));
    requestUrls.push(String(url));
    const request = JSON.parse(options.body);
    requests.push(request);
    const result = requests.length === 1
      ? {
          pageNumber: 1,
          extractedText: "Calculus\nUnit 1: Differentiation\nChain rule",
          readabilityStatus: "readable",
        }
      : onePageSyllabus;
    return geminiJsonResponse(result);
  };

  try {
    const result = await extractAndOrganizeSyllabus(
      {
        originalname: "calculus.png",
        mimetype: "image/png",
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      },
      "png",
      testUserId,
    );
    assert.deepEqual(result.structure, onePageSyllabus);
    assert.equal(result.pages[0].pageNumber, 1);
    assert.match(requests[0].contents[0].parts[0].text, /transcribe the syllabus/i);
    assert.equal(requests[0].contents[0].parts[1].inlineData.mimeType, "image/png");
    assert.match(requests[1].contents[0].parts[0].text, /do not infer or invent/i);
    assert.equal(requests[0].generationConfig.responseMimeType, "application/json");
    assert.equal(requests[0].generationConfig.responseJsonSchema.properties.pageNumber.type, "integer");
    assert.match(requestUrls[0], /test-syllabus-model/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports exhausted Gemini quota clearly for syllabus OCR", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(
    { error: { message: "The daily quota for requests is exhausted." } },
    { status: 429 },
  );

  try {
    await assert.rejects(
      extractAndOrganizeSyllabus(
        {
          originalname: "course.png",
          mimetype: "image/png",
          buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        },
        "png",
        testUserId,
      ),
      (error) => {
        assert.equal(error.statusCode, 503);
        assert.match(error.message, /Gemini usage is temporarily exhausted/i);
        assert.equal(error.retryableRateLimit, false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("extracts selectable PDF text and OCRs only scanned pages without skipping them", async (t) => {
  mockGeminiUsage(t);
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  document.addPage().drawText(
    "BCA Semester 5 Computer Graphics Unit 1 Introduction to Computer Graphics Applications History Types",
    { x: 40, y: 700, font, size: 12 },
  );
  document.addPage();
  const pdfBytes = Buffer.from(await document.save());
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(isGeminiRequest(url));
    const request = JSON.parse(options.body);
    requests.push(request);
    const pageParts = request.contents[0].parts;
    const isPageOcr = /Transcribe the syllabus/i.test(pageParts[0].text);
    if (isPageOcr) {
      assert.equal(pageParts[1].inlineData.mimeType, "application/pdf");
      return geminiJsonResponse({
        pageNumber: 2,
        extractedText: "Unit 2: 2D transformations",
        readabilityStatus: "readable",
      });
    }
    const sourceText = pageParts[0].text;
    assert.match(sourceText, /Computer Graphics/);
    assert.match(sourceText, /Unit 2: 2D transformations/);
    return geminiJsonResponse(onePageSyllabus);
  };

  try {
    const result = await extractAndOrganizeSyllabus(
      { originalname: "bca-syllabus.pdf", mimetype: "application/pdf", buffer: pdfBytes },
      "pdf",
      testUserId,
    );
    assert.equal(requests.length, 2);
    assert.equal(result.pages.length, 2);
    assert.match(result.pages[0].extractedText, /Computer Graphics/);
    assert.equal(result.pages[1].pageNumber, 2);
    assert.equal(result.pages[1].extractedText, "Unit 2: 2D transformations");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects unreadable pages instead of returning an incomplete outline", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => geminiJsonResponse({
    pageNumber: 1,
    extractedText: "",
    readabilityStatus: "unreadable",
  });
  try {
    await assert.rejects(
      extractAndOrganizeSyllabus(
        {
          originalname: "unreadable.png",
          mimetype: "image/png",
          buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        },
        "png",
        testUserId,
      ),
      /Could not read syllabus page 1/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("organizes large source text in chunks and merges repeated syllabus units", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  const prompts = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    prompts.push(request.contents[0].parts[0].text);
    const result = prompts.length === 1
      ? {
          ...onePageSyllabus,
          subjects: [{
            ...onePageSyllabus.subjects[0],
            units: [{
              ...onePageSyllabus.subjects[0].units[0],
              topics: [],
            }],
          }],
        }
      : onePageSyllabus;
    return geminiJsonResponse(result);
  };

  try {
    const structure = await organizeSyllabusPages([
      { pageNumber: 1, extractedText: `First page\n${"context ".repeat(1700)}` },
      { pageNumber: 2, extractedText: "Unit 1: Differentiation\nChain rule" },
    ], testUserId);
    assert.ok(prompts.length > 1);
    assert.match(prompts[0], /First page/);
    assert.ok(prompts.some((prompt) => /Unit 1: Differentiation/.test(prompt)));
    assert.deepEqual(structure, onePageSyllabus);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports invalid Gemini JSON rather than presenting an empty syllabus", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    candidates: [{
      content: { parts: [{ text: "not-json" }] },
    }],
  });
  try {
    await assert.rejects(
      organizeSyllabusPages(
        [{ pageNumber: 1, extractedText: "Computer Graphics" }],
        testUserId,
      ),
      /AI service returned an invalid response/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("regenerates an outline from the stored syllabus OCR text", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  let promptText = "";
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    promptText = request.contents[0].parts[0].text;
    return geminiJsonResponse(onePageSyllabus);
  };

  try {
    const structure = await organizeSyllabusPages([
      {
        pageNumber: 2,
        extractedText: "Actual syllabus heading\nUnit 1: Differentiation\nChain rule",
      },
    ], testUserId);
    assert.deepEqual(structure, onePageSyllabus);
    assert.match(promptText, /Actual syllabus heading/);
    assert.match(promptText, /do not infer or invent/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("matches only resources whose academic metadata contains topic terms", () => {
  const resource = {
    title: "Differentiation Study Notes",
    description: "Examples and practice",
    subject: "Calculus",
    unit: "Differentiation",
    topic: "Chain rule",
  };
  assert.equal(topicMatchesResource("Chain rule", resource), true);
  assert.equal(topicMatchesResource("Fourier series", resource), false);
  assert.equal(
    topicMatchesResource("Fourier series", { ocrText: "The fourier seires transform" }),
    true,
  );
});
