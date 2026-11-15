import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePyqMetadata,
  validatePyqFile,
  validatePyqPdf,
} from "./pyq-validation.service.js";

const validMetadata = {
  university: "  Example University ",
  college: "Example College",
  department: "Computer Science",
  course: "BSc",
  semester: "4",
  subject: "Algorithms",
  examinationYear: "2025",
  examType: "Final",
};

test("validates the PDF signature and rejects missing or non-PDF content", () => {
  assert.doesNotThrow(() =>
    validatePyqPdf({ buffer: Buffer.from("%PDF-1.7\n") }),
  );
  assert.throws(() => validatePyqPdf(undefined), {
    statusCode: 400,
    message: "Choose a question paper PDF to upload.",
  });
  assert.throws(
    () => validatePyqPdf({ buffer: Buffer.from("not a PDF") }),
    {
      statusCode: 400,
      message: "The uploaded file is not a valid PDF.",
    },
  );
});

test("validates PDF and image question-paper uploads by MIME type and signature", () => {
  assert.deepEqual(
    validatePyqFile({
      originalname: "paper.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n"),
    }),
    { format: "pdf", mimeType: "application/pdf" },
  );
  assert.deepEqual(
    validatePyqFile({
      originalname: "paper.png",
      mimetype: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    }),
    { format: "png", mimeType: "image/png" },
  );
  assert.throws(
    () => validatePyqFile({
      originalname: "paper.jpg",
      mimetype: "image/png",
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
    }),
    { statusCode: 400 },
  );
  assert.throws(
    () => validatePyqFile({
      originalname: "paper.png",
      mimetype: "image/png",
      buffer: Buffer.from("not an image"),
    }),
    { statusCode: 400 },
  );
});

test("normalizes valid PYQ metadata", () => {
  assert.deepEqual(parsePyqMetadata(validMetadata), {
    ...validMetadata,
    university: "Example University",
    semester: 4,
    examinationYear: 2025,
  });
});

test("retains the title and description when supplied", () => {
  assert.deepEqual(
    parsePyqMetadata({
      ...validMetadata,
      title: "Algorithms final",
      description: "Spring semester question paper",
    }),
    {
      ...validMetadata,
      university: "Example University",
      semester: 4,
      examinationYear: 2025,
      title: "Algorithms final",
      description: "Spring semester question paper",
    },
  );
});

test("supports the upload page examination labels and student profile defaults", () => {
  const { college, department, semester, university, ...paperFields } = validMetadata;
  assert.deepEqual(
    parsePyqMetadata(
      { ...paperFields, examType: "End Semester" },
      {
        college,
        department,
        semester: Number(semester),
        university: university.trim(),
      },
    ),
    {
      university: university.trim(),
      college,
      department,
      course: paperFields.course,
      semester: Number(semester),
      subject: paperFields.subject,
      examinationYear: Number(paperFields.examinationYear),
      examType: "End Semester",
    },
  );
});

test("rejects out-of-range semester and examination year", () => {
  assert.throws(
    () => parsePyqMetadata({ ...validMetadata, semester: "13" }),
    { statusCode: 400, message: "Semester must be a whole number between 1 and 12." },
  );
  assert.throws(
    () => parsePyqMetadata({ ...validMetadata, examinationYear: "1899" }),
    { statusCode: 400 },
  );
});

test("rejects missing metadata and unsupported exam types", () => {
  assert.throws(
    () => parsePyqMetadata({ ...validMetadata, subject: "  " }),
    { statusCode: 400 },
  );
  assert.throws(
    () => parsePyqMetadata({ ...validMetadata, examType: "Unrecognized" }),
    { statusCode: 400, message: "Choose a valid exam type." },
  );
});
