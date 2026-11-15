import {
  getResourceSearchOptions,
  markResourceHelpful,
  searchResources,
  suggestResources,
} from "../services/resource-search.service.js";
import mongoose from "mongoose";
import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";
import {
  getPrivateNoteDownloadUrl,
  getPrivateNotePreviewUrl,
} from "../services/note-storage.service.js";
import { ensureNotePreview } from "../services/note-preview.service.js";
import { getPyqFileUrl } from "../services/pyq-storage.service.js";
import { streamResourceView } from "../services/resource-view.service.js";
import { migrateLegacyPyqBookmarks } from "../services/student-library.service.js";

export async function searchResourceCollection(request, response) {
  if (request.user?.role === "user") {
    await migrateLegacyPyqBookmarks(request.user._id);
  }
  const result = await searchResources(request.query, request.user?._id);
  response.json({ status: "success", ...result });
}

export async function suggestResourceCollection(request, response) {
  const result = await suggestResources(request.query);
  response.json({ status: "success", ...result });
}

export async function getResourceSearchOptionsCollection(request, response) {
  const options = await getResourceSearchOptions(request.query.resourceType);
  response.json({ status: "success", options });
}

export async function markSearchResultHelpful(request, response) {
  const helpfulCount = await markResourceHelpful(
    request.params.resourceType,
    request.params.resourceId,
    request.user._id,
  );
  response.json({
    status: "success",
    message: "Thanks for helping students find useful resources.",
    helpfulCount,
  });
}

async function findViewableResource(request, { populateUploader = false } = {}) {
  const { resourceType, resourceId } = request.params;
  if (!["note", "pyq"].includes(resourceType)) {
    const error = new Error("Resource type must be note or pyq.");
    error.statusCode = 400;
    throw error;
  }
  if (!mongoose.isValidObjectId(resourceId)) {
    const error = new Error("Resource ID is invalid.");
    error.statusCode = 400;
    throw error;
  }

  const Model = resourceType === "note" ? Note : Pyq;
  let resourceQuery = Model.findById(resourceId);
  if (populateUploader) {
    resourceQuery = resourceQuery.populate("uploadedBy", "fullName");
  }
  const resource = await resourceQuery;
  if (!resource) {
    const error = new Error("Resource not found.");
    error.statusCode = 404;
    throw error;
  }
  const isPublic =
    resource.publicationStatus === "published" &&
    ["public", null, undefined].includes(resource.visibility);
  const isOwner = resource.uploadedBy?.equals(request.user._id) ?? false;
  if (!isPublic && !isOwner && request.user.role !== "admin") {
    const error = new Error("Resource not found.");
    error.statusCode = 404;
    throw error;
  }
  return { resource, resourceType };
}

export async function getResourceViewInfo(request, response) {
  const { resource, resourceType } = await findViewableResource(request, {
    populateUploader: true,
  });
  response.json({
    status: "success",
    resource: {
      format: resource.storage.format ?? "pdf",
      uploaderName: resource.uploadedBy?.fullName ?? "",
    },
  });
}

export async function viewResource(request, response) {
  const { resource, resourceType } = await findViewableResource(request);
  await streamResourceView(request, response, {
    url: resourceType === "note"
      ? getPrivateNoteDownloadUrl(resource.storage)
      : getPyqFileUrl(resource.storage),
    format: resource.storage.format ?? "pdf",
    fileName: resource.fileName,
    uploaderName: resource.uploadedBy?.fullName ?? "",
  });
}

export async function viewNotePreview(request, response) {
  if (!mongoose.isValidObjectId(request.params.resourceId)) {
    const error = new Error("Resource ID is invalid.");
    error.statusCode = 400;
    throw error;
  }

  const note = await Note.findById(request.params.resourceId);
  if (!note) {
    const error = new Error("Resource not found.");
    error.statusCode = 404;
    throw error;
  }

  const isPublic =
    note.publicationStatus === "published" &&
    ["public", null, undefined].includes(note.visibility);
  const isOwner = request.user
    ? note.uploadedBy?.equals(request.user._id) ?? false
    : false;
  if (!isPublic && !isOwner && request.user?.role !== "admin") {
    const error = new Error("Resource not found.");
    error.statusCode = 404;
    throw error;
  }

  if (note.storage.format === "pdf" && !note.previewStorage?.publicId) {
    try {
      await ensureNotePreview(note);
    } catch (error) {
      console.error(`Could not generate preview for note ${note._id}.`, error);
      response.status(503).json({
        status: "error",
        message: "The document preview is temporarily unavailable.",
      });
      return;
    }
  }

  response.set("Cross-Origin-Resource-Policy", "cross-origin");
  response.redirect(302, getPrivateNotePreviewUrl(note));
}
