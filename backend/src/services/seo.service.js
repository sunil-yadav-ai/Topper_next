import mongoose from "mongoose";
import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";
import { env } from "../config/env.js";

export const publicNoteFilter = {
  publicationStatus: "published",
  visibility: "public",
};

export const publicPyqFilter = {
  publicationStatus: "published",
  visibility: "public",
};

const resourceSelect = {
  note: "title description department semester subject university marks unit topic keywords tags createdAt updatedAt",
  pyq: "title description university college department course semester subject examinationYear examType keywords tags createdAt updatedAt",
};
const maxSitemapUrls = 50_000;
let subjectGroupsCache = { expiresAt: 0, groups: null };

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getSiteOrigin() {
  const parsed = new URL(env.frontendUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("FRONTEND_URL must use HTTP or HTTPS.");
  }
  return parsed.origin;
}

export function resourceTitle(resource, type) {
  if (resource.title?.trim()) return resource.title.trim();
  if (type === "pyq") {
    return `${resource.subject} ${resource.examinationYear} ${resource.examType} question paper`;
  }
  return `${resource.subject} notes`;
}

export function resourceDescription(resource, type) {
  const description = resource.description?.trim();
  if (description) return description;
  if (type === "pyq") {
    return [
      `${resource.examinationYear} ${resource.examType} question paper for ${resource.subject}.`,
      resource.course,
      resource.department,
      resource.university,
    ].filter(Boolean).join(" ");
  }
  return [
    resource.subject,
    resource.topic,
    resource.unit && `Unit ${resource.unit}`,
    resource.department,
    resource.university,
  ].filter(Boolean).join(" · ");
}

export function metaDescription(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= 160) return text;
  const shortened = text.slice(0, 157);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 120 ? lastSpace : 157).trimEnd()}...`;
}

function resourcePath(resource, type) {
  const collectionPath = type === "note" ? "notes" : "resources/pyq";
  const basePath = `/${collectionPath}/${resource._id}`;
  if (type === "pyq") return basePath;
  const slug = slugify(resourceTitle(resource, type));
  return slug ? `${basePath}/${slug}` : basePath;
}

function serializeResource(resource, type) {
  const title = resourceTitle(resource, type);
  const description = resourceDescription(resource, type);
  const context = type === "note"
    ? [
        resource.topic,
        resource.unit && `Unit ${resource.unit}`,
        resource.semester && `Semester ${resource.semester}`,
        resource.university,
      ]
    : [
        resource.examinationYear,
        resource.examType,
        resource.university,
        resource.college,
      ];
  const uniqueContext = context.filter(Boolean).join(" · ");
  return {
    id: resource._id.toString(),
    type,
    title,
    description,
    seoTitle: `${title} | ${resource.subject} ${type === "note" ? "Notes" : "Question Paper"}${uniqueContext ? ` · ${uniqueContext}` : ""} | Topper`,
    seoDescription: metaDescription(
      `${description}${uniqueContext ? ` ${uniqueContext}.` : ""}`,
    ),
    subject: resource.subject,
    department: resource.department ?? "",
    semester: resource.semester,
    university: resource.university ?? "",
    course: resource.course ?? "",
    college: resource.college ?? "",
    topic: resource.topic ?? "",
    unit: resource.unit ?? "",
    marks: resource.marks ?? null,
    examinationYear: resource.examinationYear ?? null,
    examType: resource.examType ?? "",
    keywords: Array.isArray(resource.keywords) ? resource.keywords : [],
    tags: Array.isArray(resource.tags) ? resource.tags : [],
    publishedAt: resource.createdAt,
    updatedAt: resource.updatedAt ?? resource.createdAt,
    path: resourcePath(resource, type),
  };
}

function isValidObjectId(value) {
  return mongoose.isValidObjectId(value);
}

export async function getPublicResourcePage(type, resourceId) {
  if (!["note", "pyq"].includes(type) || !isValidObjectId(resourceId)) {
    return null;
  }
  const Model = type === "note" ? Note : Pyq;
  const filter = type === "note" ? publicNoteFilter : publicPyqFilter;
  const resource = await Model.findOne({ ...filter, _id: resourceId })
    .select(resourceSelect[type])
    .lean();
  if (!resource) return null;

  const relatedPyqFilter = {
    ...publicPyqFilter,
    subject: new RegExp(`^${escapeRegex(resource.subject)}$`, "i"),
  };
  if (type === "pyq") relatedPyqFilter._id = { $ne: resource._id };
  const [relatedNotes, relatedPyqs] = await Promise.all([
    Note.find({
      ...publicNoteFilter,
      subject: new RegExp(`^${escapeRegex(resource.subject)}$`, "i"),
      _id: { $ne: resource._id },
    })
      .select(resourceSelect.note)
      .sort({ helpfulCount: -1, createdAt: -1 })
      .limit(6)
      .lean(),
    Pyq.find(relatedPyqFilter)
      .select(resourceSelect.pyq)
      .sort({ helpfulCount: -1, createdAt: -1 })
      .limit(6)
      .lean(),
  ]);

  const relatedResources = [
    ...relatedNotes.map((item) => serializeResource(item, "note")),
    ...relatedPyqs.map((item) => serializeResource(item, "pyq")),
  ]
    .sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt))
    .slice(0, 6);

  const serializedResource = serializeResource(resource, type);
  serializedResource.subjectPath = "";

  return {
    resource: serializedResource,
    relatedResources,
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function publicSubjectPipeline(filter) {
  return [
    { $match: { ...filter, subject: { $type: "string", $ne: "" } } },
    {
      $group: {
        _id: "$subject",
        count: { $sum: 1 },
        updatedAt: { $max: { $ifNull: ["$updatedAt", "$createdAt"] } },
      },
    },
    { $sort: { _id: 1 } },
  ];
}

async function getSubjectGroups() {
  if (subjectGroupsCache.groups && subjectGroupsCache.expiresAt > Date.now()) {
    return subjectGroupsCache.groups;
  }
  const [noteGroups, pyqGroups] = await Promise.all([
    Note.aggregate(publicSubjectPipeline(publicNoteFilter)),
    Pyq.aggregate(publicSubjectPipeline(publicPyqFilter)),
  ]);
  const groups = new Map();
  for (const group of [...noteGroups, ...pyqGroups]) {
    const slug = slugify(group._id);
    if (!slug) continue;
    const current = groups.get(slug) ?? {
      slug,
      names: new Set(),
      count: 0,
      updatedAt: null,
    };
    current.names.add(group._id);
    current.count += group.count;
    if (!current.updatedAt || group.updatedAt > current.updatedAt) {
      current.updatedAt = group.updatedAt;
    }
    groups.set(slug, current);
  }
  const resolvedGroups = [...groups.values()]
    .filter((group) => group.names.size === 1 && group.count >= 2)
    .map((group) => ({
      slug: group.slug,
      subject: [...group.names][0],
      resourceCount: group.count,
      updatedAt: group.updatedAt,
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject));
  subjectGroupsCache = {
    expiresAt: Date.now() + 60_000,
    groups: resolvedGroups,
  };
  return resolvedGroups;
}

async function resolveSubject(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const subject = (await getSubjectGroups()).find((group) => group.slug === slug);
  return subject ?? null;
}

function exactText(value) {
  return new RegExp(`^${escapeRegex(value)}$`, "i");
}

async function getSubjectResources(subject, limit = 50) {
  const subjectFilter = exactText(subject);
  const [notes, pyqs, topicGroups] = await Promise.all([
    Note.find({ ...publicNoteFilter, subject: subjectFilter })
      .select(resourceSelect.note)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Pyq.find({ ...publicPyqFilter, subject: subjectFilter })
      .select(resourceSelect.pyq)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Note.aggregate([
      {
        $match: {
          ...publicNoteFilter,
          subject: subjectFilter,
          topic: { $type: "string", $ne: "" },
        },
      },
      {
        $group: {
          _id: "$topic",
          count: { $sum: 1 },
          updatedAt: { $max: { $ifNull: ["$updatedAt", "$createdAt"] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const topicsBySlug = new Map();
  for (const topic of topicGroups) {
    const slug = slugify(topic._id);
    if (!slug) continue;
    const current = topicsBySlug.get(slug) ?? { names: new Set(), count: 0, updatedAt: null };
    current.names.add(topic._id);
    current.count += topic.count;
    if (!current.updatedAt || topic.updatedAt > current.updatedAt) {
      current.updatedAt = topic.updatedAt;
    }
    topicsBySlug.set(slug, current);
  }
  const topics = [...topicsBySlug.entries()]
    .filter(([, topic]) => topic.names.size === 1 && topic.count >= 2)
    .map(([slug, topic]) => ({
      slug,
      topic: [...topic.names][0],
      resourceCount: topic.count,
      updatedAt: topic.updatedAt,
    }))
    .sort((left, right) => left.topic.localeCompare(right.topic));

  return {
    resources: [
      ...notes.map((item) => serializeResource(item, "note")),
      ...pyqs.map((item) => serializeResource(item, "pyq")),
    ]
      .sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt))
      .slice(0, limit),
    topics,
  };
}

export async function getSubjectDirectoryPage() {
  return getSubjectGroups();
}

export async function getSubjectPage(slug) {
  const subject = await resolveSubject(slug);
  if (!subject) return null;
  const { resources, topics } = await getSubjectResources(subject.subject);
  return { ...subject, resources, topics };
}

export async function getTopicPage(subjectSlug, topicSlug) {
  const subject = await resolveSubject(subjectSlug);
  if (!subject || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topicSlug)) {
    return null;
  }
  const subjectFilter = exactText(subject.subject);
  const topicGroups = await Note.aggregate([
    {
      $match: {
        ...publicNoteFilter,
        subject: subjectFilter,
        topic: { $type: "string", $ne: "" },
      },
    },
    { $group: { _id: "$topic", count: { $sum: 1 }, updatedAt: { $max: "$updatedAt" } } },
    { $sort: { _id: 1 } },
  ]);
  const topics = topicGroups.filter((topic) => slugify(topic._id) === topicSlug);
  if (topics.length !== 1 || topics[0].count < 2) return null;

  const topic = topics[0];
  const resources = await Note.find({
    ...publicNoteFilter,
    subject: subjectFilter,
    topic: exactText(topic._id),
  })
    .select(resourceSelect.note)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return {
    subject,
    topic: topic._id,
    topicSlug,
    resourceCount: topic.count,
    updatedAt: topic.updatedAt,
    resources: resources.map((item) => serializeResource(item, "note")),
  };
}

export async function buildSitemapEntries() {
  const siteOrigin = getSiteOrigin();
  const entries = [
    { path: "/", lastmod: null },
    { path: "/advertising", lastmod: null },
    { path: "/terms", lastmod: null },
  ];
  if (mongoose.connection.readyState !== 1) return entries;

  const remaining = Math.max(0, maxSitemapUrls - entries.length);
  const notes = await Note.find(publicNoteFilter)
    .select("_id title subject createdAt updatedAt")
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(remaining)
    .lean();
  for (const note of notes) {
    entries.push({
      path: resourcePath(note, "note"),
      lastmod: note.updatedAt ?? note.createdAt,
    });
  }

  return entries.map((entry) => ({
    ...entry,
    url: new URL(entry.path, siteOrigin).href,
  }));
}
