import Note from "../models/Note.js";
import NoteOcrResult from "../models/NoteOcrResult.js";
import Pyq from "../models/Pyq.js";
import { decryptOcrResult } from "./note-ocr.service.js";
import { createSearchQuery } from "./resource-search-index.service.js";
import { normalizeSyllabusStructure } from "./syllabus-analysis.service.js";

const ignoredWords = new Set([
  "a", "an", "and", "for", "from", "in", "of", "on", "or", "the", "to", "with",
]);
const candidateLimit = 500;
const displayLimit = 100;
const resourceTokenCache = new WeakMap();

function escapedRegex(value) {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

function tokens(value) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && !ignoredWords.has(token));
}

function editDistance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0),
  );
  for (let row = 0; row <= left.length; row += 1) rows[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) {
    rows[0][column] = column;
  }
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        rows[row][column] = Math.min(
          rows[row][column],
          rows[row - 2][column - 2] + 1,
        );
      }
    }
  }
  return rows[left.length][right.length];
}

function tokenMatches(expected, actual) {
  if (expected === actual) return true;
  const maxDistance = expected.length >= 8 ? 2 : 1;
  return (
    expected.length >= 4 &&
    Math.abs(expected.length - actual.length) <= maxDistance &&
    editDistance(expected, actual) <= maxDistance
  );
}

function getResourceTokenIndex(resource) {
  const cached = resourceTokenCache.get(resource);
  if (cached) return cached;
  const searchableText = [
    resource.title,
    resource.description,
    resource.subject,
    resource.unit,
    resource.topic,
    resource.keywords,
    resource.tags,
    resource.ocrText,
  ]
    .filter(Boolean)
    .join(" ");
  const index = new Map();
  for (const token of tokens(searchableText)) {
    if (!index.has(token.length)) index.set(token.length, new Set());
    index.get(token.length).add(token);
  }
  resourceTokenCache.set(resource, index);
  return index;
}

export function topicMatchesResource(topic, resource) {
  const availableTokens = getResourceTokenIndex(resource);
  const topicTokens = tokens(topic);
  return topicTokens.length > 0 && topicTokens.every((token) => {
    if (availableTokens.get(token.length)?.has(token)) return true;
    const distance = token.length >= 8 ? 2 : 1;
    for (let length = token.length - distance; length <= token.length + distance; length += 1) {
      for (const available of availableTokens.get(length) ?? []) {
        if (tokenMatches(token, available)) return true;
      }
    }
    return false;
  });
}

function phraseMatchesResource(topic, resource) {
  const phrase = tokens(topic).join(" ");
  if (!phrase) return false;
  const fields = [
    resource.title,
    resource.description,
    resource.subject,
    resource.unit,
    resource.topic,
    resource.keywords,
    resource.tags,
    resource.ocrText,
  ];
  return fields.some((field) => tokens(Array.isArray(field) ? field.join(" ") : field).join(" ").includes(phrase));
}

function matchesSyllabusTerm(term, subjectName, resource) {
  return topicMatchesResource(term, resource) &&
    (
      topicMatchesResource(subjectName, { subject: resource.subject }) ||
      phraseMatchesResource(term, resource)
    );
}

function serializeNote(note) {
  return {
    id: note._id.toString(),
    type: "note",
    title: note.title,
    description: note.description,
    department: note.department,
    semester: note.semester,
    subject: note.subject,
    unit: note.unit,
    topic: note.topic,
    createdAt: note.createdAt,
    viewPath: `/search/resources/note/${note._id}/view`,
  };
}

function serializePyq(pyq) {
  return {
    id: pyq._id.toString(),
    type: "pyq",
    title: pyq.title || `${pyq.subject} - ${pyq.examinationYear} ${pyq.examType}`,
    description: pyq.description || `${pyq.course} · ${pyq.department}`,
    department: pyq.department,
    semester: pyq.semester,
    subject: pyq.subject,
    examinationYear: pyq.examinationYear,
    createdAt: pyq.createdAt,
    viewPath: `/search/resources/pyq/${pyq._id}/view`,
  };
}

export async function findSyllabusResources(input) {
  const { subjects } = normalizeSyllabusStructure(input);
  const results = [];
  const missingTopics = [];

  for (const subject of subjects) {
    const subjectPattern = escapedRegex(subject.subjectName);
    const syllabusTerms = subject.units.flatMap((unit) =>
      unit.topics.flatMap((topic) => [topic.topicName, ...topic.subtopics]),
    );
    const candidateNgrams = new Set(createSearchQuery(subject.subjectName).ngrams);
    for (const term of syllabusTerms.slice(0, 250)) {
      for (const ngram of createSearchQuery(term).ngrams) {
        candidateNgrams.add(ngram);
        if (candidateNgrams.size >= 2000) break;
      }
      if (candidateNgrams.size >= 2000) break;
    }
    const ngrams = [...candidateNgrams];
    const noteFilter = {
      publicationStatus: "published",
      visibility: { $in: ["public", null] },
      $or: [
        { subject: subjectPattern },
        ...(ngrams.length ? [{ searchNgrams: { $in: ngrams } }] : []),
      ],
    };
    const [notes, pyqs] = await Promise.all([
      Note.find(noteFilter)
        .select("title description department semester subject unit topic keywords tags createdAt")
        .sort({ createdAt: -1, _id: 1 })
        .limit(candidateLimit + 1)
        .lean(),
      Pyq.find({
        $or: [
          { subject: subjectPattern },
          ...(ngrams.length ? [{ searchNgrams: { $in: ngrams } }] : []),
        ],
        publicationStatus: "published",
        visibility: { $in: ["public", null] },
      })
        .select("subject title description keywords tags examinationYear examType course department semester createdAt")
        .sort({ createdAt: -1, _id: 1 })
        .limit(displayLimit + 1)
        .lean(),
    ]);
    const noteCandidatesTruncated = notes.length > candidateLimit;
    const noteCandidates = notes.slice(0, candidateLimit);
    const ocrResults = noteCandidates.length
      ? await NoteOcrResult.find({ note: { $in: noteCandidates.map((note) => note._id) } })
          .select("+encryptedResult")
          .lean()
      : [];
    const ocrByNoteId = new Map(ocrResults.map((result) => [
      result.note.toString(),
      decryptOcrResult(result.encryptedResult),
    ]));
    const notesWithOcr = noteCandidates.map((note) => ({
      ...note,
      ocrText: (ocrByNoteId.get(note._id.toString())?.pages ?? [])
        .map((page) => page.extractedText)
        .filter(Boolean)
        .join("\n"),
    }));
    const subjectNotes = notesWithOcr.filter((note) =>
      topicMatchesResource(subject.subjectName, { subject: note.subject }),
    );
    const matchedSubjectPyqs = pyqs.filter((pyq) =>
      topicMatchesResource(subject.subjectName, { subject: pyq.subject }),
    );
    const subjectPyqs = matchedSubjectPyqs.slice(0, displayLimit);
    const matchedSubjectNotes = subjectNotes.filter((note) =>
      syllabusTerms.some((term) =>
        matchesSyllabusTerm(term, subject.subjectName, note),
      ),
    );
    const notesTruncated = matchedSubjectNotes.length > displayLimit;
    const pyqsTruncated = matchedSubjectPyqs.length > displayLimit;

    const units = subject.units.map((unit) => ({
      name: unit.unitNumber
        ? `Unit ${unit.unitNumber}: ${unit.unitTitle}`
        : unit.unitTitle,
      topics: unit.topics.map((topic) => {
        const terms = [topic.topicName, ...topic.subtopics];
        const matchingNotes = notesWithOcr.filter((note) =>
          terms.some((term) =>
            matchesSyllabusTerm(term, subject.subjectName, note),
          ),
        );
        if (!matchingNotes.length && !noteCandidatesTruncated) {
          missingTopics.push({
            subject: subject.subjectName,
            unit: unit.unitTitle,
            topic: topic.topicName,
          });
        }
        return {
          name: topic.topicName,
          subtopics: topic.subtopics,
          notes: matchingNotes.map(serializeNote),
          pyqs: subjectPyqs
            .filter((pyq) =>
              terms.some((term) =>
                matchesSyllabusTerm(term, subject.subjectName, pyq),
              ),
            )
            .map(serializePyq),
          coverageComplete: !noteCandidatesTruncated,
        };
      }),
    }));

    results.push({
      subject: subject.subjectName,
      units,
      notes: matchedSubjectNotes
        .slice(0, displayLimit)
        .map(serializeNote),
      notesTruncated,
      pyqs: subjectPyqs.map(serializePyq),
      pyqsTruncated,
      pyqCoverage: "subject",
    });
  }

  return {
    subjects: results,
    missingTopics,
    note:
      "Question papers are matched to topics when their titles or descriptions name them; otherwise they are shown at subject level.",
    topicCoverageNote:
      "Topic coverage checks up to the 500 most recent published notes matching the syllabus subject or topic search terms. Topics without a match when this limit is reached are marked as unverified, not missing.",
  };
}
