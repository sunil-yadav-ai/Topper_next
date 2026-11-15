import { basename } from "node:path";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import SyllabusAnalysis from "../models/SyllabusAnalysis.js";
import { decryptJson } from "../services/encrypted-json.service.js";
import {
  encryptSyllabusAnalysis,
  extractAndOrganizeSyllabus,
  organizeSyllabusPages,
  normalizeSyllabusStructure,
  validateSyllabusFile,
} from "../services/syllabus-analysis.service.js";
import { findSyllabusResources } from "../services/syllabus-resource.service.js";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function serializeSummary(analysis) {
  return {
    id: analysis._id.toString(),
    fileName: analysis.fileName,
    pageCount: analysis.pageCount,
    status: analysis.status,
    processingError: analysis.processingError ?? null,
    createdAt: analysis.createdAt,
    updatedAt: analysis.updatedAt,
  };
}

function serializeAnalysis(analysis) {
  const data = decryptJson(analysis.encryptedAnalysis);
  data.structure = data.structure?.subjects?.length
    ? normalizeSyllabusStructure(data.structure, { allowEmpty: true })
    : { course: null, semester: null, subjects: [] };
  return {
    ...serializeSummary(analysis),
    ...data,
  };
}

async function findOwnedAnalysis(request) {
  if (!mongoose.isValidObjectId(request.params.analysisId)) {
    throw badRequest("Syllabus analysis ID is invalid.");
  }
  const analysis = await SyllabusAnalysis.findOne({
    _id: request.params.analysisId,
    uploadedBy: request.user._id,
  }).select("+encryptedAnalysis");
  if (!analysis) {
    const error = new Error("Syllabus analysis not found.");
    error.statusCode = 404;
    throw error;
  }
  return analysis;
}

export async function uploadSyllabus(request, response) {
  if (!request.file) {
    throw badRequest("Choose a syllabus PDF or image to upload.");
  }
  const fileInfo = validateSyllabusFile(request.file);
  const sourceHash = createHash("sha256").update(request.file.buffer).digest("hex");
  const emptyEncryptedAnalysis = encryptSyllabusAnalysis({
    pages: [],
    structure: { course: null, semester: null, subjects: [] },
    resources: null,
  });
  const existing = await SyllabusAnalysis.findOne({
    uploadedBy: request.user._id,
    sourceHash,
  }).select("+encryptedAnalysis");
  let analysis;
  if (existing) {
    if (existing.status !== "failed") {
      response.json({
        status: "success",
        message: "This syllabus is already in your analyses.",
        analysis: serializeAnalysis(existing),
      });
      return;
    }
    analysis = await SyllabusAnalysis.findOneAndUpdate(
      { _id: existing._id, status: "failed" },
      {
        $set: {
          status: "processing",
          encryptedAnalysis: emptyEncryptedAnalysis,
        },
        $unset: { processingError: 1 },
      },
      { new: true, runValidators: true },
    ).select("+encryptedAnalysis");
    if (!analysis) {
      const current = await SyllabusAnalysis.findById(existing._id)
        .select("+encryptedAnalysis");
      if (!current) throw new Error("Duplicate syllabus record disappeared during retry.");
      response.json({
        status: "success",
        message: "This syllabus is already in your analyses.",
        analysis: serializeAnalysis(current),
      });
      return;
    }
  }
  else {
    try {
      analysis = await SyllabusAnalysis.create({
        uploadedBy: request.user._id,
        sourceHash,
        fileName: basename(request.file.originalname.replace(/\\/g, "/")).slice(0, 255),
        status: "processing",
        encryptedAnalysis: emptyEncryptedAnalysis,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const duplicate = await SyllabusAnalysis.findOne({
        uploadedBy: request.user._id,
        sourceHash,
      }).select("+encryptedAnalysis");
      if (!duplicate) throw error;
      response.json({
        status: "success",
        message: "This syllabus is already in your analyses.",
        analysis: serializeAnalysis(duplicate),
      });
      return;
    }
  }

  try {
    const extracted = await extractAndOrganizeSyllabus(
      request.file,
      fileInfo.format,
      request.user._id,
    );
    analysis.pageCount = extracted.pages.length;
    analysis.status = "review";
    analysis.processingError = undefined;
    analysis.encryptedAnalysis = encryptSyllabusAnalysis({
      ...extracted,
      resources: null,
    });
    await analysis.save();
    response.status(201).json({
      status: "success",
      message: "Syllabus extracted. Review and correct the outline before searching resources.",
      analysis: {
        ...serializeSummary(analysis),
        ...extracted,
      },
    });
  } catch (error) {
    analysis.status = "failed";
    const processingFailed = !error.statusCode || error.statusCode >= 500;
    analysis.processingError = error.expose
      ? error.message
      : processingFailed
        ? "Syllabus analysis failed. Please try again or upload a clearer file."
        : error.message;
    await analysis.save();
    if (processingFailed) {
      console.error("Syllabus analysis failed:", error);
    }
    response.status(error.statusCode ?? 502).json({
      status: "error",
      message: analysis.processingError,
      analysis: serializeSummary(analysis),
    });
  }
}

export async function listSyllabusAnalyses(request, response) {
  const analyses = await SyllabusAnalysis.find({ uploadedBy: request.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  response.json({
    status: "success",
    analyses: analyses.map(serializeSummary),
  });
}

export async function getSyllabusAnalysis(request, response) {
  const analysis = await findOwnedAnalysis(request);
  response.json({
    status: "success",
    analysis: serializeAnalysis(analysis),
  });
}

export async function updateSyllabusStructure(request, response) {
  const analysis = await findOwnedAnalysis(request);
  if (!["review", "confirmed"].includes(analysis.status)) {
    throw badRequest("Only an extracted syllabus can be edited.");
  }
  const structure = normalizeSyllabusStructure(request.body?.structure);
  const data = decryptJson(analysis.encryptedAnalysis);
  data.structure = structure;
  data.resources = null;
  analysis.status = "review";
  analysis.processingError = undefined;
  analysis.encryptedAnalysis = encryptSyllabusAnalysis(data);
  await analysis.save();
  response.json({
    status: "success",
    message: "Your corrected syllabus outline has been saved.",
    analysis: {
      ...serializeSummary(analysis),
      ...data,
    },
  });
}

export async function regenerateSyllabusStructure(request, response) {
  const analysis = await findOwnedAnalysis(request);
  if (!["review", "confirmed"].includes(analysis.status)) {
    throw badRequest("Only an extracted syllabus can be regenerated.");
  }
  const data = decryptJson(analysis.encryptedAnalysis);
  try {
    data.structure = await organizeSyllabusPages(
      data.pages ?? [],
      request.user._id,
    );
    data.resources = null;
    analysis.status = "review";
    analysis.processingError = undefined;
    analysis.encryptedAnalysis = encryptSyllabusAnalysis(data);
    await analysis.save();
    response.json({
      status: "success",
      message: "The syllabus outline was regenerated from the uploaded document text.",
      analysis: {
        ...serializeSummary(analysis),
        ...data,
      },
    });
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) {
      console.error("Syllabus outline regeneration failed:", error);
    }
    response.status(error.statusCode ?? 502).json({
      status: "error",
      message: error.message ?? "Syllabus outline regeneration failed.",
    });
  }
}

export async function confirmSyllabusAndFindResources(request, response) {
  const analysis = await findOwnedAnalysis(request);
  if (analysis.status !== "review") {
    throw badRequest("Review and save the extracted syllabus before searching resources.");
  }
  const data = decryptJson(analysis.encryptedAnalysis);
  const hasPartiallyReadablePages = (data.pages ?? []).some(
    (page) => page.readabilityStatus === "partially_readable",
  );
  if (hasPartiallyReadablePages && request.body?.reviewedPartialPages !== true) {
    throw badRequest(
      "Review the partially readable source pages and confirm that you corrected any missed content.",
    );
  }
  const structure = normalizeSyllabusStructure(data.structure);
  const resources = await findSyllabusResources(structure);
  data.structure = structure;
  data.resources = resources;
  analysis.status = "confirmed";
  analysis.encryptedAnalysis = encryptSyllabusAnalysis(data);
  await analysis.save();
  response.json({
    status: "success",
    message: "Matching approved platform resources are ready.",
    analysis: {
      ...serializeSummary(analysis),
      ...data,
    },
  });
}
