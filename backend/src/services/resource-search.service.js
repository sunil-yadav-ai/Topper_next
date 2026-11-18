import mongoose from "mongoose";
import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";
import ResourceHelpfulVote from "../models/ResourceHelpfulVote.js";
import Bookmark from "../models/Bookmark.js";
import User from "../models/User.js";
import {
  createSearchQuery,
  scoreResourceSearch,
} from "./resource-search-index.service.js";

const supportedNoteMarks = new Set([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function escapedPrefix(value) {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
}

function escapedExact(value) {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

function parsePage(value, fallback, maximum) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw badRequest(`Value must be a whole number between 1 and ${maximum}.`);
  }
  return parsed;
}

function parseTextFilter(query, field) {
  const value = query[field];
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value.trim().length > 160) {
    throw badRequest(`${field} must be 160 characters or fewer.`);
  }
  return value.trim();
}

export function parseResourceSearchQuery(query) {
  const q = parseTextFilter(query, "q");
  if (q.length > 100) throw badRequest("q must be 100 characters or fewer.");
  const resourceType = query.resourceType ?? "";
  if (!["", "note", "pyq"].includes(resourceType)) {
    throw badRequest("resourceType must be note or pyq.");
  }
  const sort = query.sort ?? "recent";
  if (!["recent", "helpful"].includes(sort)) {
    throw badRequest("sort must be recent or helpful.");
  }

  const semesterValue = query.semester;
  let semester;
  if (semesterValue !== undefined && semesterValue !== "") {
    semester = Number(semesterValue);
    if (!Number.isInteger(semester) || semester < 1 || semester > 12) {
      throw badRequest("semester must be a whole number between 1 and 12.");
    }
  }

  const examinationYearValue = query.examinationYear;
  let examinationYear;
  if (examinationYearValue !== undefined && examinationYearValue !== "") {
    examinationYear = Number(examinationYearValue);
    if (
      !Number.isInteger(examinationYear) ||
      examinationYear < 1900 ||
      examinationYear > new Date().getFullYear() + 1
    ) {
      throw badRequest("examinationYear must be a valid four-digit year.");
    }
  }

  const marksValue = query.marks;
  let marks;
  if (marksValue !== undefined && marksValue !== "") {
    marks = Number(marksValue);
    if (!Number.isInteger(marks) || !supportedNoteMarks.has(marks)) {
      throw badRequest("marks must be one of the supported note mark values.");
    }
  }

  return {
    q,
    resourceType,
    sort,
    page: parsePage(query.page, 1, 100),
    limit: parsePage(query.limit, 12, 50),
    semester,
    examinationYear,
    marks,
    department: parseTextFilter(query, "department"),
    university: parseTextFilter(query, "university"),
    college: parseTextFilter(query, "college"),
    batch: parseTextFilter(query, "batch"),
    subject: parseTextFilter(query, "subject"),
    unit: parseTextFilter(query, "unit"),
    topic: parseTextFilter(query, "topic"),
  };
}

async function findUploaderIds(filters, fields = ["college", "batch"]) {
  const userFilter = {};
  for (const field of fields) {
    if (filters[field]) {
      userFilter[field] = field === "university"
        ? escapedExact(filters[field])
        : escapedPrefix(filters[field]);
    }
  }
  if (!Object.keys(userFilter).length) return null;
  return User.distinct("_id", userFilter);
}

function createNoteFilter(filters, uploaderIds, legacyUniversityIds) {
  const filter = { ...publishedNoteFilter };
  if (filters.semester) filter.semester = filters.semester;
  if (filters.marks !== undefined) filter.marks = filters.marks;
  if (filters.department) filter.department = escapedPrefix(filters.department);
  if (filters.subject) filter.subject = escapedExact(filters.subject);
  if (filters.unit) filter.unit = escapedPrefix(filters.unit);
  if (uploaderIds) filter.uploadedBy = { $in: uploaderIds };
  if (filters.university) {
    const universityFilter = { university: escapedExact(filters.university) };
    if (legacyUniversityIds?.length) {
      filter.$and = [
        ...(filter.$and ?? []),
        {
          $or: [
            universityFilter,
            {
              uploadedBy: { $in: legacyUniversityIds },
              $or: [{ university: { $exists: false } }, { university: "" }],
            },
          ],
        },
      ];
    } else {
      Object.assign(filter, universityFilter);
    }
  }
  return filter;
}

function createPyqFilter(filters, uploaderIds) {
  const filter = { ...publishedPyqFilter };
  if (filters.semester) filter.semester = filters.semester;
  if (filters.examinationYear) filter.examinationYear = filters.examinationYear;
  for (const field of ["department", "university", "college", "subject"]) {
    if (filters[field]) {
      filter[field] = ["university", "subject"].includes(field)
        ? escapedExact(filters[field])
        : escapedPrefix(filters[field]);
    }
  }
  if (uploaderIds) filter.uploadedBy = { $in: uploaderIds };
  return filter;
}

const publishedNoteFilter = {
  publicationStatus: "published",
  visibility: { $in: ["public", null] },
};
const publishedPyqFilter = {
  publicationStatus: "published",
  visibility: { $in: ["public", null] },
};

function logSearchDiagnostic(diagnostic) {
  console.info(`[resource-search] ${JSON.stringify(diagnostic)}`);
}

async function getNoteStatusBreakdown() {
  return Note.aggregate([
    {
      $group: {
        _id: {
          publicationStatus: { $ifNull: ["$publicationStatus", "(missing)"] },
          visibility: { $ifNull: ["$visibility", "(missing)"] },
          approvalDecision: { $ifNull: ["$approvalDecision", "(missing)"] },
          ocrStatus: { $ifNull: ["$ocrStatus", "(missing)"] },
          verificationStatus: { $ifNull: ["$verificationStatus", "(missing)"] },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);
}

async function getPyqStatusBreakdown() {
  return Pyq.aggregate([
    {
      $group: {
        _id: {
          publicationStatus: { $ifNull: ["$publicationStatus", "(missing)"] },
          visibility: { $ifNull: ["$visibility", "(missing)"] },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);
}

function sortedValues(values) {
  const sorted = values
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.trim())
    .sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }) ||
      right.localeCompare(left),
    );
  const unique = new Map();
  for (const value of sorted) {
    const key = value.toLowerCase();
    if (!unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()];
}

export async function getResourceSearchOptions(resourceType) {
  if (!["note", "pyq"].includes(resourceType)) {
    throw badRequest("resourceType must be note or pyq.");
  }

  if (resourceType === "note") {
    const [subjects, topics, uploaderIds, noteUniversities, searchableDocuments] =
      await Promise.all([
        Note.distinct("subject", publishedNoteFilter),
        Note.distinct("topic", publishedNoteFilter),
        Note.distinct("uploadedBy", {
          ...publishedNoteFilter,
          $or: [{ university: { $exists: false } }, { university: "" }],
        }),
        Note.distinct("university", publishedNoteFilter),
        Note.countDocuments(publishedNoteFilter),
      ]);
    const legacyUniversities = uploaderIds.length
      ? await User.distinct("university", { _id: { $in: uploaderIds } })
      : [];
    const options = {
      subjects: sortedValues(subjects),
      topics: sortedValues(topics),
      universities: sortedValues([...noteUniversities, ...legacyUniversities]),
      years: [],
    };
    logSearchDiagnostic({
      endpoint: "GET /api/search/options",
      resourceType,
      collection: Note.collection.name,
      statusFilter: publishedNoteFilter,
      searchableDocuments,
      optionCounts: {
        subjects: options.subjects.length,
        topics: options.topics.length,
        universities: options.universities.length,
      },
      excludedReason: "Notes that are not published are excluded.",
      ...(searchableDocuments === 0
        ? { statusBreakdown: await getNoteStatusBreakdown() }
        : {}),
    });
    return options;
  }

  const [subjects, universities, years, searchableDocuments] = await Promise.all([
    Pyq.distinct("subject", publishedPyqFilter),
    Pyq.distinct("university", publishedPyqFilter),
    Pyq.distinct("examinationYear", publishedPyqFilter),
    Pyq.countDocuments(publishedPyqFilter),
  ]);
  const options = {
    subjects: sortedValues(subjects),
    topics: [],
    universities: sortedValues(universities),
    years: years.filter(Number.isInteger).sort((left, right) => right - left),
  };
  logSearchDiagnostic({
    endpoint: "GET /api/search/options",
    resourceType,
    collection: Pyq.collection.name,
    statusFilter: publishedPyqFilter,
    searchableDocuments,
    optionCounts: {
      subjects: options.subjects.length,
      universities: options.universities.length,
      years: options.years.length,
    },
    excludedReason: "Question papers that are not published are excluded.",
    ...(searchableDocuments === 0
      ? { statusBreakdown: await getPyqStatusBreakdown() }
      : {}),
  });
  return options;
}

function sortFor(sort) {
  return sort === "helpful"
    ? { helpfulCount: -1, createdAt: -1, _id: 1 }
    : { createdAt: -1, _id: 1 };
}

function serializeUploader(uploader) {
  if (!uploader) return null;
  const uploaderId = uploader._id?.toString()
    ?? (mongoose.isValidObjectId(uploader) ? uploader.toString() : "");
  return {
    ...(uploaderId ? { id: uploaderId } : {}),
    fullName: uploader.fullName ?? "",
    username: uploader.username ?? "",
  };
}

async function findSmartSearchCandidates(Model, filter, query, fields, sort) {
  if (!query.tokens.length) return [];
  const expressions = [...new Set([query.normalized, ...query.tokens])]
    .filter((value) => value.length >= 2)
    .map((value) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  const textFields = fields.flatMap((field) =>
    expressions.map((expression) => ({ [field]: expression })),
  );
  const rows = await Model.aggregate([
    { $match: filter },
    {
      $match: {
        $or: [
          { searchNgrams: { $in: query.ngrams } },
          ...textFields,
        ],
      },
    },
    {
      $addFields: {
        _smartSearchOverlap: {
          $size: {
            $setIntersection: [
              { $ifNull: ["$searchNgrams", []] },
              query.ngrams,
            ],
          },
        },
      },
    },
    {
      $sort: {
        _smartSearchOverlap: -1,
        ...sort,
      },
    },
    { $limit: 1000 },
  ]);
  const populated = await Model.populate(rows, {
    path: "uploadedBy",
    select:
      Model === Note
        ? "university college batch fullName username"
        : "batch fullName username",
  });
  return populated
    .map((resource) => ({
      ...resource,
      ...scoreResourceSearch(resource, query),
    }))
    .filter((resource) => resource.rank > 0)
    .sort((left, right) =>
      right.rank - left.rank ||
      right.score - left.score ||
      (sort.helpfulCount
        ? (right.helpfulCount ?? 0) - (left.helpfulCount ?? 0)
        : 0) ||
      new Date(right.createdAt) - new Date(left.createdAt) ||
      left._id.toString().localeCompare(right._id.toString()),
    );
}

function asNote(note) {
  return {
    id: note._id.toString(),
    type: "note",
    title: note.title,
    description: note.description,
    department: note.department,
    university: note.university || note.uploadedBy?.university || "",
    college: note.uploadedBy?.college ?? "",
    batch: note.uploadedBy?.batch ?? "",
    semester: note.semester,
    subject: note.subject,
    marks: note.marks ?? null,
    unit: note.unit,
    topic: note.topic,
    uploader: serializeUploader(note.uploadedBy),
    fileFormat: note.storage.format,
    pageCount: note.ocrPageCount ?? 1,
    downloadCount: note.downloadCount ?? 0,
    helpfulCount: note.helpfulCount ?? 0,
    createdAt: note.createdAt,
    previewPath: `/search/resources/note/${note._id}/preview`,
    viewPath: `/search/resources/note/${note._id}/view`,
  };
}

function asPyq(pyq) {
  return {
    id: pyq._id.toString(),
    type: "pyq",
    title: pyq.title || `${pyq.subject} - ${pyq.examinationYear} ${pyq.examType}`,
    description: pyq.description || `${pyq.course} · ${pyq.department}`,
    department: pyq.department,
    university: pyq.university,
    college: pyq.college,
    batch: pyq.uploadedBy?.batch ?? "",
    semester: pyq.semester,
    subject: pyq.subject,
    unit: "",
    topic: "",
    fileFormat: pyq.storage.format ?? "pdf",
    downloadCount: pyq.downloadCount ?? 0,
    helpfulCount: pyq.helpfulCount ?? 0,
    examinationYear: pyq.examinationYear,
    uploader: serializeUploader(pyq.uploadedBy),
    createdAt: pyq.createdAt,
    viewPath: `/search/resources/pyq/${pyq._id}/view`,
  };
}

export async function searchResources(query, userId = null) {
  const filters = parseResourceSearchQuery(query);
  const [uploaderIds, legacyUniversityIds, pyqUploaderIds] = await Promise.all([
    findUploaderIds(filters),
    filters.university
      ? findUploaderIds(filters, ["university"])
      : null,
    filters.batch
      ? User.distinct("_id", { batch: escapedPrefix(filters.batch) })
      : null,
  ]);
  const noteFilter = createNoteFilter(filters, uploaderIds, legacyUniversityIds);
  const pyqFilter = createPyqFilter(filters, pyqUploaderIds);
  const includeNotes =
    filters.resourceType !== "pyq" && (!uploaderIds || uploaderIds.length > 0);
  const includePyqs = filters.resourceType !== "note";
  const requestedNotes = filters.resourceType !== "pyq";
  const requestedPyqs = filters.resourceType !== "note";
  const sourceLimit = filters.page * filters.limit + 1;
  const order = sortFor(filters.sort);
  const searchText = [filters.q, filters.topic].filter(Boolean).join(" ");
  const smartQuery = searchText ? createSearchQuery(searchText) : null;
  let notes;
  let pyqs;
  let noteCount;
  let pyqCount;
  if (smartQuery) {
    [notes, pyqs] = await Promise.all([
      includeNotes
        ? findSmartSearchCandidates(
            Note,
            noteFilter,
            smartQuery,
            ["title", "subject", "topic", "unit", "description", "fileName"],
            order,
          )
        : [],
      includePyqs
        ? findSmartSearchCandidates(
            Pyq,
            pyqFilter,
            smartQuery,
            [
              "title",
              "subject",
              "description",
              "university",
              "college",
              "department",
              "course",
              "examType",
              "fileName",
            ],
            order,
          )
        : [],
    ]);
    noteCount = notes.length;
    pyqCount = pyqs.length;
  } else {
    [notes, pyqs, noteCount, pyqCount] = await Promise.all([
      includeNotes
        ? Note.find(noteFilter)
            .populate("uploadedBy", "university college batch fullName username")
            .sort(order)
            .limit(sourceLimit)
            .lean()
        : [],
      includePyqs
        ? Pyq.find(pyqFilter)
            .populate("uploadedBy", "batch fullName username")
            .sort(order)
            .limit(sourceLimit)
            .lean()
        : [],
      includeNotes ? Note.countDocuments(noteFilter) : 0,
      includePyqs ? Pyq.countDocuments(pyqFilter) : 0,
    ]);
  }
  const [searchableNoteCount, searchablePyqCount] = await Promise.all([
    requestedNotes && noteCount === 0
      ? Note.countDocuments(publishedNoteFilter)
      : null,
    requestedPyqs && pyqCount === 0
      ? Pyq.countDocuments(publishedPyqFilter)
      : null,
  ]);
  const statusBreakdowns = await Promise.all([
    searchableNoteCount === 0 ? getNoteStatusBreakdown() : null,
    searchablePyqCount === 0 ? getPyqStatusBreakdown() : null,
  ]);
  logSearchDiagnostic({
    endpoint: "GET /api/search",
    filters: Object.fromEntries(
      Object.entries(filters).filter(([, value]) =>
        value !== "" && value !== undefined,
      ),
    ),
    collections: [
      ...(includeNotes
        ? [
            {
              name: Note.collection.name,
              statusFilter: publishedNoteFilter,
              matchingDocuments: noteCount,
              documentsReturned: notes.length,
              ...(searchableNoteCount !== null
                ? { searchableDocumentsBeforeFilters: searchableNoteCount }
                : {}),
              ...(statusBreakdowns[0]
                ? { statusBreakdown: statusBreakdowns[0] }
                : {}),
            },
          ]
        : []),
      ...(includePyqs
        ? [
            {
              name: Pyq.collection.name,
              statusFilter: publishedPyqFilter,
              matchingDocuments: pyqCount,
              documentsReturned: pyqs.length,
              ...(searchablePyqCount !== null
                ? { searchableDocumentsBeforeFilters: searchablePyqCount }
                : {}),
              ...(statusBreakdowns[1]
                ? { statusBreakdown: statusBreakdowns[1] }
                : {}),
            },
          ]
        : []),
    ],
    totalMatchingDocuments: noteCount + pyqCount,
    ...(noteCount + pyqCount === 0
      ? {
          excludedReason:
            (!requestedNotes || searchableNoteCount === 0) &&
            (!requestedPyqs || searchablePyqCount === 0)
              ?               "No documents satisfy the published status filters."
              : "No searchable documents matched all supplied search filters.",
        }
      : {}),
  });
  const pageResourceIds = [
    ...notes.map((note) => ({ resourceType: "note", resource: note._id })),
    ...pyqs.map((pyq) => ({ resourceType: "pyq", resource: pyq._id })),
  ];
  const bookmarks =
    userId && pageResourceIds.length
      ? await Bookmark.find({ user: userId, $or: pageResourceIds })
          .select("resourceType resource")
          .lean()
      : [];
  const bookmarkKeys = new Set(
    bookmarks.map((bookmark) => `${bookmark.resourceType}:${bookmark.resource}`),
  );
  const combined = [
    ...notes.map((note) => ({
      ...asNote(note),
      _searchRank: note.rank ?? 0,
      _searchScore: note.score ?? 0,
      isBookmarked: bookmarkKeys.has(`note:${note._id}`),
    })),
    ...pyqs.map((pyq) => ({
      ...asPyq(pyq),
      _searchRank: pyq.rank ?? 0,
      _searchScore: pyq.score ?? 0,
      isBookmarked: bookmarkKeys.has(`pyq:${pyq._id}`),
    })),
  ].sort((left, right) => {
    if (smartQuery && right._searchRank !== left._searchRank) {
      return right._searchRank - left._searchRank;
    }
    if (smartQuery && right._searchScore !== left._searchScore) {
      return right._searchScore - left._searchScore;
    }
    if (filters.sort === "helpful" && right.helpfulCount !== left.helpfulCount) {
      return right.helpfulCount - left.helpfulCount;
    }
    const dateDifference = new Date(right.createdAt) - new Date(left.createdAt);
    return dateDifference || left.id.localeCompare(right.id);
  });
  const offset = (filters.page - 1) * filters.limit;
  const total = noteCount + pyqCount;

  return {
    resources: combined
      .slice(offset, offset + filters.limit)
      .map(({ _searchRank, _searchScore, ...resource }) => resource),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pages: Math.ceil(total / filters.limit),
    },
  };
}

function suggestionStages(filter, field, prefix, maxResults) {
  return [
    { $match: { ...filter, [field]: prefix } },
    { $group: { _id: `$${field}` } },
    { $sort: { _id: 1 } },
    { $limit: maxResults },
    { $project: { _id: 0, value: "$_id" } },
  ];
}

export async function suggestResources(query) {
  const prefix = parseTextFilter(query, "q");
  if (prefix.length > 100) throw badRequest("q must be 100 characters or fewer.");
  if (!prefix) return { suggestions: [] };
  const resourceType = query.resourceType ?? "";
  if (!["", "note", "pyq"].includes(resourceType)) {
    throw badRequest("resourceType must be note or pyq.");
  }
  if (query.field !== undefined && query.field !== "topic") {
    throw badRequest("field must be topic.");
  }
  if (query.field === "topic" && resourceType === "pyq") {
    throw badRequest("Topic suggestions are available for notes only.");
  }
  const startsWith = escapedPrefix(prefix);
  const noteFilter = publishedNoteFilter;
  const pyqFilter = publishedPyqFilter;
  const jobs = [];
  if (resourceType !== "pyq") {
    if (query.field === "topic") {
      jobs.push(Note.aggregate(suggestionStages(noteFilter, "topic", startsWith, 10)));
    } else {
      jobs.push(
        Note.aggregate(suggestionStages(noteFilter, "subject", startsWith, 6)),
        Note.aggregate(suggestionStages(noteFilter, "topic", startsWith, 6)),
        Note.aggregate(suggestionStages(noteFilter, "unit", startsWith, 6)),
        Note.aggregate(suggestionStages(noteFilter, "title", startsWith, 6)),
      );
    }
  }
  if (resourceType !== "note") {
    jobs.push(
      Pyq.aggregate(suggestionStages(pyqFilter, "subject", startsWith, 6)),
    );
  }
  const resultSets = await Promise.all(jobs);
  const suggestions = new Map();
  for (const values of resultSets) {
    for (const { value } of values) {
      if (typeof value === "string" && value.trim()) {
        suggestions.set(value.toLocaleLowerCase(), value);
      }
    }
  }
  return {
    suggestions: [...suggestions.values()].sort((left, right) =>
      left.localeCompare(right),
    ).slice(0, 10),
  };
}

export async function markResourceHelpful(resourceType, resourceId, userId) {
  if (!["note", "pyq"].includes(resourceType)) {
    throw badRequest("Resource type must be note or pyq.");
  }
  if (!mongoose.isValidObjectId(resourceId)) {
    throw badRequest("Resource ID is invalid.");
  }
  const filter = {
    _id: resourceId,
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  };
  const ResourceModel = resourceType === "note" ? Note : Pyq;
  const resource = await ResourceModel.findOne(filter).select("_id");
  if (!resource) {
    const error = new Error("Published resource not found.");
    error.statusCode = 404;
    throw error;
  }
  try {
    await ResourceHelpfulVote.create({
      resourceType,
      resource: resource._id,
      user: userId,
    });
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 409;
      error.message = "You have already marked this resource as helpful.";
    }
    throw error;
  }
  const updated = await ResourceModel.findOneAndUpdate(
    filter,
    { $inc: { helpfulCount: 1 } },
    { new: true },
  ).select("helpfulCount");
  if (!updated) {
    await ResourceHelpfulVote.deleteOne({
      resourceType,
      resource: resource._id,
      user: userId,
    });
    const error = new Error("Published resource not found.");
    error.statusCode = 404;
    throw error;
  }
  return updated.helpfulCount;
}
