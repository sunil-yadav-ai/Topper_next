import mongoose from "mongoose";
import Scholarship from "../models/Scholarship.js";
import ScholarshipApplication from "../models/ScholarshipApplication.js";
import {
  checkEligibility,
  getProfile,
  getScholarshipBySlug,
  listPublishedScholarships,
  listSaved,
  recordApplication,
  saveProfile,
  toggleSaved,
} from "../services/scholarship.service.js";
import {
  discoverAllConfiguredScholarships,
  getScholarshipSourceStats,
} from "../services/scholarship-discovery.service.js";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export async function listScholarships(request, response) {
  response.json({ status: "success", ...(await listPublishedScholarships(request.query)) });
}

export async function getCategories(_request, response) {
  const categories = await Scholarship.distinct("category", { publicationStatus: "published" });
  response.json({ status: "success", categories: categories.flat().filter(Boolean).sort() });
}

export async function getSourceStats(_request, response) {
  response.json({ status: "success", sources: await getScholarshipSourceStats() });
}

export async function getFeatured(_request, response) {
  const result = await listPublishedScholarships({ featured: "true", limit: "12" });
  response.json({ status: "success", scholarships: result.scholarships });
}

export async function runDiscovery(request, response) {
  const result = await discoverAllConfiguredScholarships({
    dryRun: request.query?.dryRun === "true",
  });
  response.json({ status: "success", discovery: result });
}

export async function getScholarship(request, response) {
  response.json({ status: "success", scholarship: await getScholarshipBySlug(request.params.slug) });
}

export async function getScholarshipProfile(request, response) {
  const profile = await getProfile(request.user._id);
  response.json({ status: "success", profile });
}

export async function postScholarshipProfile(request, response) {
  const profile = await saveProfile(request.user._id, request.body, true);
  response.status(201).json({ status: "success", message: "Scholarship profile saved securely.", profile });
}

export async function putScholarshipProfile(request, response) {
  const profile = await saveProfile(request.user._id, request.body, false);
  response.json({ status: "success", message: "Scholarship profile updated.", profile });
}

export async function checkScholarshipEligibility(request, response) {
  const scholarshipId = String(request.body?.scholarshipId ?? "");
  if (!mongoose.isValidObjectId(scholarshipId)) throw badRequest("Scholarship ID is invalid.");
  if (request.body?.answers != null && (typeof request.body.answers !== "object" || Array.isArray(request.body.answers))) {
    throw badRequest("Eligibility answers must be an object.");
  }
  const result = await checkEligibility(request.user._id, scholarshipId, request.body?.answers ?? {});
  response.json({ status: "success", ...result });
}

export async function saveScholarship(request, response) {
  const result = await toggleSaved(request.user._id, String(request.body?.scholarshipId ?? ""));
  response.json({ status: "success", ...result });
}

export async function getSavedScholarships(request, response) {
  response.json({ status: "success", scholarships: await listSaved(request.user._id) });
}

export async function listApplications(request, response) {
  const applications = await ScholarshipApplication.find({ user: request.user._id })
    .populate("scholarship").sort({ updatedAt: -1 }).lean();
  response.json({
    status: "success",
    applications: applications.map((item) => ({
      id: item._id.toString(),
      scholarship: item.scholarship,
      applicationId: item.applicationId,
      applicationDate: item.applicationDate,
      status: item.status,
      eligibilityResult: item.eligibilityResult,
      redirectedAt: item.redirectedAt,
      notes: item.notes,
      updatedAt: item.updatedAt,
    })),
  });
}

export async function createApplication(request, response) {
  const scholarshipId = String(request.body?.scholarshipId ?? "");
  if (!mongoose.isValidObjectId(scholarshipId)) throw badRequest("Scholarship ID is invalid.");
  const result = await recordApplication(request.user._id, scholarshipId, request.body?.answers ?? {});
  response.status(201).json({ status: "success", ...result });
}

export async function updateApplication(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) throw badRequest("Application ID is invalid.");
  const allowed = ["intended", "in_progress", "submitted", "approved", "rejected"];
  const status = request.body?.status;
  if (status && !allowed.includes(status)) throw badRequest("Application status is invalid.");
  const update = {};
  if (status) update.status = status;
  if (typeof request.body?.applicationId === "string") update.applicationId = request.body.applicationId.trim();
  if (request.body?.applicationDate) {
    const date = new Date(request.body.applicationDate);
    if (Number.isNaN(date.getTime())) throw badRequest("Application date is invalid.");
    update.applicationDate = date;
  }
  if (typeof request.body?.notes === "string") update.notes = request.body.notes.trim();
  const application = await ScholarshipApplication.findOneAndUpdate(
    { _id: request.params.id, user: request.user._id },
    { $set: update },
    { new: true, runValidators: true },
  );
  if (!application) {
    const error = new Error("Application not found.");
    error.statusCode = 404;
    throw error;
  }
  response.json({ status: "success", application: { id: application._id.toString(), status: application.status, applicationId: application.applicationId, applicationDate: application.applicationDate, notes: application.notes } });
}
