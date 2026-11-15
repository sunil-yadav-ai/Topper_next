const examTypes = [
  "Mid Semester",
  "End Semester",
  "Internal",
  "External",
  "Midterm",
  "Final",
  "Supplementary",
  "Quiz",
  "Other",
];

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requiredText(body, field, maxLength, fallback = "") {
  const rawValue = typeof body[field] === "string" ? body[field] : fallback;
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value || value.length > maxLength) {
    throw badRequest(`${field} is required and must be at most ${maxLength} characters.`);
  }
  return value;
}

export function validatePyqPdf(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw badRequest("Choose a question paper PDF to upload.");
  }
  if (file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw badRequest("The uploaded file is not a valid PDF.");
  }
}

export function validatePyqFile(file) {
  const extension = file?.originalname?.split(".").pop()?.toLowerCase();
  const mimeTypes = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  if (!file || !Buffer.isBuffer(file.buffer) || !mimeTypes[extension]) {
    throw badRequest("Choose a question paper PDF or image to upload.");
  }
  if (!file.buffer.length || file.buffer.length > 20 * 1024 * 1024) {
    throw badRequest("Question paper files must be between 1 byte and 20 MB.");
  }
  if (file.mimetype !== mimeTypes[extension]) {
    throw badRequest("The file type does not match the selected question paper.");
  }
  const validSignature =
    extension === "pdf"
      ? file.buffer.subarray(0, 5).toString("ascii") === "%PDF-"
      : extension === "png"
        ? file.buffer.subarray(0, 8).equals(
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
          )
        : file.buffer[0] === 0xff &&
          file.buffer[1] === 0xd8 &&
          file.buffer[2] === 0xff;
  if (!validSignature) {
    throw badRequest("The uploaded file contents do not match its file type.");
  }
  return { format: extension, mimeType: mimeTypes[extension] };
}

export function parsePyqMetadata(body, uploader = {}) {
  const semester = Number(body.semester || uploader.semester);
  const examinationYear = Number(body.examinationYear);
  const currentYear = new Date().getFullYear();

  if (!Number.isInteger(semester) || semester < 1 || semester > 12) {
    throw badRequest("Semester must be a whole number between 1 and 12.");
  }
  if (
    !Number.isInteger(examinationYear) ||
    examinationYear < 1900 ||
    examinationYear > currentYear + 1
  ) {
    throw badRequest(`Examination year must be between 1900 and ${currentYear + 1}.`);
  }
  if (!examTypes.includes(body.examType)) {
    throw badRequest("Choose a valid exam type.");
  }

  const metadata = {
    university: requiredText(body, "university", 160, uploader.university),
    college: requiredText(body, "college", 160, uploader.college),
    department: requiredText(body, "department", 120, uploader.department),
    course: requiredText(body, "course", 120),
    semester,
    subject: requiredText(body, "subject", 160),
    examinationYear,
    examType: body.examType,
  };
  if (body.title !== undefined) metadata.title = requiredText(body, "title", 200);
  if (body.description !== undefined) {
    metadata.description = requiredText(body, "description", 2000);
  }
  return metadata;
}
