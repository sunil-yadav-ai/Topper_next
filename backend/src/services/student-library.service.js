import mongoose from "mongoose";
import Bookmark from "../models/Bookmark.js";
import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";
import StudentResourceAccess from "../models/StudentResourceAccess.js";
import User from "../models/User.js";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function publishedFilter(resourceType, resourceId) {
  return {
    _id: resourceId,
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  };
}

function modelFor(resourceType) {
  return resourceType === "note" ? Note : Pyq;
}

export async function migrateLegacyPyqBookmarks(userId) {
  const user = await User.findById(userId).select("+savedPyqs");
  if (!user?.savedPyqs?.length) return;
  const approvedIds = await Pyq.find({
    _id: { $in: user.savedPyqs },
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  }).distinct("_id");
  if (approvedIds.length) {
    await Bookmark.bulkWrite(
      approvedIds.map((resource) => ({
        updateOne: {
          filter: { user: userId, resourceType: "pyq", resource },
          update: {
            $setOnInsert: {
              user: userId,
              resourceType: "pyq",
              resource,
              folder: "Saved",
            },
          },
          upsert: true,
        },
      })),
    );
  }
  await User.updateOne({ _id: userId }, { $set: { savedPyqs: [] } });
}

export async function assertBookmarkable(resourceType, resourceId) {
  if (!["note", "pyq"].includes(resourceType)) {
    throw badRequest("Resource type must be note or pyq.");
  }
  if (!mongoose.isValidObjectId(resourceId)) {
    throw badRequest("Resource ID is invalid.");
  }
  const resource = await modelFor(resourceType)
    .findOne(publishedFilter(resourceType, resourceId))
    .select("_id");
  if (!resource) {
    const error = new Error("Approved resource not found.");
    error.statusCode = 404;
    throw error;
  }
  return resource;
}

export async function recordResourceAccess({
  userId,
  resourceType,
  resourceId,
  downloaded = false,
}) {
  if (!userId || !["note", "pyq"].includes(resourceType)) return;
  const now = new Date();
  const update = {
    $set: { lastAccessedAt: now },
    $setOnInsert: { user: userId, resourceType, resource: resourceId },
  };
  if (downloaded) {
    update.$set.lastDownloadedAt = now;
    update.$inc = { downloadCount: 1 };
  }
  await StudentResourceAccess.findOneAndUpdate(
    { user: userId, resourceType, resource: resourceId },
    update,
    { upsert: true, new: true, runValidators: true },
  );
}

function serializeLibraryResource(resource, resourceType, bookmark) {
  const common = {
    id: resource._id.toString(),
    type: resourceType,
    title:
      resourceType === "note"
        ? resource.title
        : resource.title || `${resource.subject} - ${resource.examinationYear} ${resource.examType}`,
    subject: resource.subject,
    department: resource.department,
    semester: resource.semester,
    createdAt: resource.createdAt,
    helpfulCount: resource.helpfulCount ?? 0,
    folder: bookmark?.folder,
  };
  if (resourceType === "note") {
    return {
      ...common,
      description: resource.description,
      unit: resource.unit,
      topic: resource.topic,
      university: resource.university || resource.uploader?.university || "",
      marks: resource.marks ?? null,
      college: resource.uploader?.college ?? "",
      batch: resource.uploader?.batch ?? "",
      fileFormat: resource.storage.format,
      viewPath: `/search/resources/note/${resource._id}/view`,
    };
  }
  return {
    ...common,
    description: resource.description || `${resource.course} · ${resource.department}`,
    university: resource.university,
    college: resource.college,
    batch: resource.uploader?.batch ?? "",
    examinationYear: resource.examinationYear,
    examType: resource.examType,
    fileFormat: resource.storage.format ?? "pdf",
    viewPath: `/search/resources/pyq/${resource._id}/view`,
  };
}

async function findResources(resourceIds) {
  const notes = resourceIds
    .filter((entry) => entry.resourceType === "note")
    .map((entry) => entry.resource);
  const pyqs = resourceIds
    .filter((entry) => entry.resourceType === "pyq")
    .map((entry) => entry.resource);
  const [noteDocs, pyqDocs] = await Promise.all([
    notes.length
      ? Note.find({
          _id: { $in: notes },
          publicationStatus: "published",
          visibility: { $in: ["public", null] },
        })
          .populate("uploadedBy", "university college batch")
          .lean()
      : [],
    pyqs.length
      ? Pyq.find({
          _id: { $in: pyqs },
          publicationStatus: "published",
          visibility: { $in: ["public", null] },
        })
          .populate("uploadedBy", "batch")
          .lean()
      : [],
  ]);
  return new Map([
    ...noteDocs.map((note) => [
      `note:${note._id}`,
      { ...note, uploader: note.uploadedBy },
    ]),
    ...pyqDocs.map((pyq) => [
      `pyq:${pyq._id}`,
      { ...pyq, uploader: pyq.uploadedBy },
    ]),
  ]);
}

export async function getStudentLibrary(userId, section) {
  if (!["saved", "recent", "downloads"].includes(section)) {
    throw badRequest("Library section must be saved, recent, or downloads.");
  }
  await migrateLegacyPyqBookmarks(userId);
  if (section === "saved") {
    const bookmarks = await Bookmark.find({ user: userId })
      .sort({ folder: 1, updatedAt: -1 })
      .limit(200)
      .lean();
    const resources = await findResources(bookmarks);
    const items = bookmarks.flatMap((bookmark) => {
      const resource = resources.get(
        `${bookmark.resourceType}:${bookmark.resource}`,
      );
      return resource
        ? [
            {
              ...serializeLibraryResource(
                resource,
                bookmark.resourceType,
                bookmark,
              ),
              bookmarkId: bookmark._id.toString(),
              savedAt: bookmark.createdAt,
            },
          ]
        : [];
    });
    return {
      items,
      folders: [...new Set(items.map((item) => item.folder))].sort(),
    };
  }

  const activityFilter =
    section === "downloads"
      ? { user: userId, lastDownloadedAt: { $ne: null } }
      : { user: userId, lastAccessedAt: { $ne: null } };
  const accesses = await StudentResourceAccess.find(activityFilter)
    .sort(
      section === "downloads"
        ? { lastDownloadedAt: -1 }
        : { lastAccessedAt: -1 },
    )
    .limit(100)
    .lean();
  const resources = await findResources(accesses);
  const bookmarkPairs = accesses.length
    ? await Bookmark.find({
        user: userId,
        $or: accesses.map(({ resourceType, resource }) => ({
          resourceType,
          resource,
        })),
      })
        .select("resourceType resource folder")
        .lean()
    : [];
  const bookmarkMap = new Map(
    bookmarkPairs.map((bookmark) => [
      `${bookmark.resourceType}:${bookmark.resource}`,
      bookmark,
    ]),
  );
  const items = accesses.flatMap((access) => {
    const resource = resources.get(
      `${access.resourceType}:${access.resource}`,
    );
    if (!resource) return [];
    return [
      {
        ...serializeLibraryResource(
          resource,
          access.resourceType,
          bookmarkMap.get(`${access.resourceType}:${access.resource}`),
        ),
        lastAccessedAt: access.lastAccessedAt,
        lastDownloadedAt: access.lastDownloadedAt,
        downloadCount: access.downloadCount,
      },
    ];
  });
  return { items, folders: [] };
}

export async function saveLibraryBookmark({
  userId,
  resourceType,
  resourceId,
  folder,
}) {
  await assertBookmarkable(resourceType, resourceId);
  const normalizedFolder =
    typeof folder === "string" && folder.trim() ? folder.trim() : "Saved";
  if (normalizedFolder.length > 60) {
    throw badRequest("Folder name must be 60 characters or fewer.");
  }
  const bookmark = await Bookmark.findOneAndUpdate(
    { user: userId, resourceType, resource: resourceId },
    {
      $setOnInsert: {
        user: userId,
        resourceType,
        resource: resourceId,
        folder: normalizedFolder,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
  return bookmark;
}

export async function moveLibraryBookmark({ userId, bookmarkId, folder }) {
  if (!mongoose.isValidObjectId(bookmarkId)) {
    throw badRequest("Bookmark ID is invalid.");
  }
  if (typeof folder !== "string" || !folder.trim() || folder.trim().length > 60) {
    throw badRequest("Folder name must be between 1 and 60 characters.");
  }
  const bookmark = await Bookmark.findOneAndUpdate(
    { _id: bookmarkId, user: userId },
    { $set: { folder: folder.trim() } },
    { new: true, runValidators: true },
  );
  if (!bookmark) {
    const error = new Error("Bookmark not found.");
    error.statusCode = 404;
    throw error;
  }
  return bookmark;
}

export async function removeLibraryBookmark({ userId, bookmarkId }) {
  if (!mongoose.isValidObjectId(bookmarkId)) {
    throw badRequest("Bookmark ID is invalid.");
  }
  const result = await Bookmark.deleteOne({ _id: bookmarkId, user: userId });
  if (!result.deletedCount) {
    const error = new Error("Bookmark not found.");
    error.statusCode = 404;
    throw error;
  }
}

export async function removeLibraryBookmarkByResource({
  userId,
  resourceType,
  resourceId,
}) {
  if (!["note", "pyq"].includes(resourceType)) {
    throw badRequest("Resource type must be note or pyq.");
  }
  if (!mongoose.isValidObjectId(resourceId)) {
    throw badRequest("Resource ID is invalid.");
  }
  await Bookmark.deleteOne({ user: userId, resourceType, resource: resourceId });
}
