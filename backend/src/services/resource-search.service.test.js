import assert from "node:assert/strict";
import test from "node:test";
import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";
import User from "../models/User.js";
import {
  getResourceSearchOptions,
  parseResourceSearchQuery,
  searchResources,
} from "./resource-search.service.js";
import { createSearchNgrams } from "./resource-search-index.service.js";

test("parses supported academic filters, sort, and pagination", () => {
  assert.deepEqual(
    parseResourceSearchQuery({
      q: "linear algebra",
      department: "Mathematics",
      university: "Example University",
      college: "Main Campus",
      batch: "2025",
      examinationYear: "2024",
      semester: "4",
      subject: "Algebra",
      marks: "15",
      unit: "Matrices",
      topic: "Eigenvalues",
      resourceType: "note",
      sort: "helpful",
      page: "2",
      limit: "20",
    }),
    {
      q: "linear algebra",
      resourceType: "note",
      sort: "helpful",
      page: 2,
      limit: 20,
      semester: 4,
      examinationYear: 2024,
      marks: 15,
      department: "Mathematics",
      university: "Example University",
      college: "Main Campus",
      batch: "2025",
      subject: "Algebra",
      unit: "Matrices",
      topic: "Eigenvalues",
    },
  );
});

test("applies safe defaults and rejects invalid search controls", () => {
  assert.deepEqual(parseResourceSearchQuery({}), {
    q: "",
    resourceType: "",
    sort: "recent",
    page: 1,
    limit: 12,
    semester: undefined,
    examinationYear: undefined,
    marks: undefined,
    department: "",
    university: "",
    college: "",
    batch: "",
    subject: "",
    unit: "",
    topic: "",
  });
  assert.throws(() => parseResourceSearchQuery({ resourceType: "other" }), {
    statusCode: 400,
  });
  assert.throws(() => parseResourceSearchQuery({ sort: "oldest" }), {
    statusCode: 400,
  });
  assert.throws(() => parseResourceSearchQuery({ semester: "0" }), {
    statusCode: 400,
  });
  assert.throws(() => parseResourceSearchQuery({ examinationYear: "1899" }), {
    statusCode: 400,
  });
  assert.throws(() => parseResourceSearchQuery({ marks: "7" }), {
    statusCode: 400,
  });
  assert.throws(() => parseResourceSearchQuery({ q: "a".repeat(101) }), {
    statusCode: 400,
  });
});

test("builds case-insensitive dynamic filter options from searchable resources", async () => {
  const originalNoteDistinct = Note.distinct;
  const originalNoteCountDocuments = Note.countDocuments;
  const originalPyqDistinct = Pyq.distinct;
  const originalPyqCountDocuments = Pyq.countDocuments;
  const originalUserDistinct = User.distinct;
  const noteFilter = {
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  };
  const pyqFilter = {
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  };

  Note.distinct = async (field, filter) => {
    if (field === "subject") {
      assert.deepEqual(filter, noteFilter);
      return ["Computer Graphics", "computer graphics", " Physics "];
    }
    if (field === "topic") {
      assert.deepEqual(filter, noteFilter);
      return ["Rendering", "rendering"];
    }
    if (field === "uploadedBy") {
      assert.deepEqual(filter, {
        ...noteFilter,
        $or: [{ university: { $exists: false } }, { university: "" }],
      });
      return ["legacy-uploader"];
    }
    assert.equal(field, "university");
    assert.deepEqual(filter, noteFilter);
    return ["PTU", "ptu", " LPU "];
  };
  Note.countDocuments = async (filter) => {
    assert.deepEqual(filter, noteFilter);
    return 3;
  };
  User.distinct = async (field, filter) => {
    assert.equal(field, "university");
    assert.deepEqual(filter, { _id: { $in: ["legacy-uploader"] } });
    return ["GNDU", "gndu"];
  };
  Pyq.distinct = async (field, filter) => {
    assert.deepEqual(filter, pyqFilter);
    if (field === "subject") return ["Mathematics", "mathematics"];
    if (field === "university") return ["PTU", "GNDU", "ptu"];
    assert.equal(field, "examinationYear");
    return [2025, 2024];
  };
  Pyq.countDocuments = async (filter) => {
    assert.deepEqual(filter, pyqFilter);
    return 2;
  };

  try {
    assert.deepEqual(await getResourceSearchOptions("note"), {
      subjects: ["Computer Graphics", "Physics"],
      topics: ["Rendering"],
      universities: ["GNDU", "LPU", "PTU"],
      years: [],
    });
    assert.deepEqual(await getResourceSearchOptions("pyq"), {
      subjects: ["Mathematics"],
      topics: [],
      universities: ["GNDU", "PTU"],
      years: [2025, 2024],
    });
  } finally {
    Note.distinct = originalNoteDistinct;
    Note.countDocuments = originalNoteCountDocuments;
    Pyq.distinct = originalPyqDistinct;
    Pyq.countDocuments = originalPyqCountDocuments;
    User.distinct = originalUserDistinct;
  }
});

test("note schema uses publicationStatus rather than isPublished for search eligibility", () => {
  assert.ok(Note.schema.path("publicationStatus"));
  assert.ok(Note.schema.path("visibility"));
  assert.equal(Note.schema.path("isPublished"), undefined);
});

test("combines subject, topic, and university filters and returns the matching count", async () => {
  const originalNoteAggregate = Note.aggregate;
  const originalNotePopulate = Note.populate;
  const originalUserDistinct = User.distinct;
  const filter = {
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
    subject: /^Computer Graphics$/i,
    university: /^PTU$/i,
  };
  User.distinct = async (field, query) => {
    assert.equal(field, "_id");
    assert.deepEqual(query, { university: /^PTU$/i });
    return [];
  };
  const matchingNote = {
    _id: { toString: () => "note-123" },
    title: "Rendering basics",
    description: "Computer graphics notes",
    department: "Computer Science",
    subject: "Computer Graphics",
    university: "PTU",
    uploadedBy: {
      _id: { toString: () => "507f1f77bcf86cd799439011" },
      fullName: "Ada Student",
      username: "ada.student",
    },
    visibility: "public",
    topic: "Rendering",
    unit: "Unit 1",
    semester: 4,
    storage: { format: "pdf" },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    searchNgrams: createSearchNgrams([
      "Rendering basics",
      "Computer graphics notes",
      "Computer Graphics",
      "Rendering",
      "Unit 1",
    ]),
  };
  Note.aggregate = async (pipeline) => {
    assert.deepEqual(pipeline[0].$match, filter);
    return [matchingNote];
  };
  Note.populate = async (resources) => resources;

  try {
    const result = await searchResources({
      resourceType: "note",
      subject: "Computer Graphics",
      university: "PTU",
      topic: "Render",
    });
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].id, "note-123");
    assert.equal(result.resources[0].subject, "Computer Graphics");
    assert.deepEqual(result.resources[0].uploader, {
      id: "507f1f77bcf86cd799439011",
      fullName: "Ada Student",
      username: "ada.student",
    });
    assert.equal(result.pagination.total, 1);
  } finally {
    Note.aggregate = originalNoteAggregate;
    Note.populate = originalNotePopulate;
    User.distinct = originalUserDistinct;
  }
});

test("filters notes by supported marks with topic and subject, excluding notes without matching marks", async () => {
  const originalAggregate = Note.aggregate;
  const originalPopulate = Note.populate;
  const originalFind = Note.find;
  const originalCountDocuments = Note.countDocuments;
  const originalUserDistinct = User.distinct;
  const matchingNote = {
    _id: "marked-note",
    title: "Flowchart examples",
    description: "Python flowchart questions",
    department: "cse",
    university: "gndu",
    subject: "python",
    topic: "Flowchart",
    unit: "",
    marks: 15,
    semester: 5,
    storage: { format: "pdf" },
    createdAt: new Date("2026-04-11T00:00:00Z"),
    searchNgrams: createSearchNgrams([
      "Flowchart examples",
      "Python flowchart questions",
      "python",
      "Flowchart",
    ]),
  };
  const expectedFilter = {
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
    subject: /^python$/i,
    marks: 15,
  };
  const expectedMarksOnlyFilter = {
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
    marks: 15,
  };
  User.distinct = async () => [];
  Note.aggregate = async (pipeline) => {
    assert.deepEqual(pipeline[0].$match, expectedFilter);
    return [matchingNote];
  };
  Note.populate = async (resources) => resources;
  Note.find = (filter) => {
    assert.deepEqual(filter, expectedMarksOnlyFilter);
    return {
      populate() { return this; },
      sort() { return this; },
      limit() { return this; },
      async lean() { return [matchingNote]; },
    };
  };
  Note.countDocuments = async (filter) => {
    assert.deepEqual(filter, expectedMarksOnlyFilter);
    return 1;
  };

  try {
    const combined = await searchResources({
      resourceType: "note",
      subject: "python",
      topic: "flowchart",
      marks: "15",
    });
    assert.deepEqual(combined.resources.map((resource) => resource.id), ["marked-note"]);
    assert.equal(combined.resources[0].marks, 15);
    assert.equal(combined.pagination.total, 1);

    const marksOnly = await searchResources({
      resourceType: "note",
      marks: "15",
    });
    assert.deepEqual(marksOnly.resources.map((resource) => resource.id), ["marked-note"]);
    assert.equal(marksOnly.pagination.total, 1);
  } finally {
    Note.aggregate = originalAggregate;
    Note.populate = originalPopulate;
    Note.find = originalFind;
    Note.countDocuments = originalCountDocuments;
    User.distinct = originalUserDistinct;
  }
});

test("smart search applies academic filters and finds the flowchart resource for typo variants", async () => {
  const originalAggregate = Note.aggregate;
  const originalPopulate = Note.populate;
  const originalUserDistinct = User.distinct;
  const matchingNote = {
    _id: "flowchart-note",
    title: "Flowchart Drawing",
    description: "How to draw a flowchart step by step",
    department: "Computer Science",
    subject: "Computer Science",
    university: "PTU",
    topic: "Draw a Flowchart",
    unit: "Algorithms",
    semester: 3,
    storage: { format: "pdf" },
    createdAt: new Date("2026-01-01T00:00:00Z"),
    searchNgrams: createSearchNgrams([
      "Flowchart Drawing",
      "How to draw a flowchart step by step",
      "Computer Science",
      "Draw a Flowchart",
      "Algorithms",
    ]),
  };
  Note.aggregate = async (pipeline) => {
    assert.deepEqual(pipeline[0].$match, {
      publicationStatus: "published",
      visibility: { $in: ["public", null] },
      subject: /^Computer Science$/i,
      university: /^PTU$/i,
    });
    assert.ok(pipeline[1].$match.$or.some((candidate) => candidate.searchNgrams));
    return [matchingNote];
  };
  Note.populate = async (resources) => resources;
  User.distinct = async () => [];

  try {
    for (const q of [
      "Draw a Flowchart",
      "drow a flow chart",
      "drwa flowchart",
      "flowchrt",
      "flow chart",
      "draw flow char",
    ]) {
      const result = await searchResources({
        q,
        resourceType: "note",
        subject: "Computer Science",
        topic: "Draw",
        university: "PTU",
      });
      assert.equal(result.resources[0]?.id, "flowchart-note", `"${q}" should find the note`);
      assert.equal(result.pagination.total, 1);
    }
  } finally {
    Note.aggregate = originalAggregate;
    Note.populate = originalPopulate;
    User.distinct = originalUserDistinct;
  }
});

test("topic search fuzzy-matches note titles while preserving publication and university filters", async () => {
  const originalAggregate = Note.aggregate;
  const originalPopulate = Note.populate;
  const originalFind = Note.find;
  const originalCountDocuments = Note.countDocuments;
  const originalUserDistinct = User.distinct;
  const fixtures = [
    {
      _id: "flowchart-note-1",
      title: "drow a flowChart",
      description: "",
      department: "cse",
      university: "gndu",
      subject: "python",
      topic: "",
      unit: "",
      semester: 5,
      publicationStatus: "published",
      visibility: "public",
      storage: { format: "pdf" },
      createdAt: new Date("2026-04-11T00:00:00Z"),
      searchNgrams: createSearchNgrams(["drow a flowChart", "python", "gndu", "cse"]),
    },
    {
      _id: "flowchart-note-2",
      title: "drawing a flowChart",
      description: "",
      department: "cse",
      university: "gndu",
      subject: "python",
      topic: "",
      unit: "",
      semester: 5,
      publicationStatus: "published",
      visibility: "public",
      storage: { format: "pdf" },
      createdAt: new Date("2026-04-10T00:00:00Z"),
      searchNgrams: createSearchNgrams([
        "drawing a flowChart",
        "python",
        "gndu",
        "cse",
      ]),
    },
  ];
  User.distinct = async () => [];
  Note.populate = async (resources) => resources;
  Note.aggregate = async (pipeline) => {
    assert.equal(pipeline[0].$match.publicationStatus, "published");
    assert.deepEqual(pipeline[0].$match.visibility, { $in: ["public", null] });
    assert.equal(pipeline[0].$match.topic, undefined);
    const candidates = pipeline[1].$match.$or;
    assert.ok(candidates.some((candidate) => candidate.searchNgrams));
    const expressions = candidates.flatMap((candidate) =>
      Object.values(candidate).filter((value) => value instanceof RegExp),
    );
    return fixtures.filter((note) =>
      candidates.some((candidate) =>
        candidate.searchNgrams
          ? note.searchNgrams.some((gram) => candidate.searchNgrams.$in.includes(gram))
          : Object.entries(candidate).some(([field]) =>
              expressions.some((expression) => expression.test(note[field] ?? "")),
            ),
      ),
    );
  };
  Note.find = (filter) => {
    assert.equal(filter.publicationStatus, "published");
    assert.deepEqual(filter.visibility, { $in: ["public", null] });
    if (filter.university) assert.equal(filter.university.toString(), "/^gndu$/i");
    return {
      populate() { return this; },
      sort() { return this; },
      limit() { return this; },
      async lean() { return fixtures; },
    };
  };
  Note.countDocuments = async () => fixtures.length;

  try {
    for (const query of [
      { topic: "drow a flowChart" },
      { topic: "flowchart" },
      { university: "gndu" },
      { topic: "drow a flowChart", university: "gndu" },
      {},
    ]) {
      const result = await searchResources({ ...query, resourceType: "note" });
      assert.deepEqual(
        result.resources.map((resource) => resource.id).sort(),
        ["flowchart-note-1", "flowchart-note-2"],
        `Expected both notes for ${JSON.stringify(query)}`,
      );
      assert.equal(result.pagination.total, 2);
    }
  } finally {
    Note.aggregate = originalAggregate;
    Note.populate = originalPopulate;
    Note.find = originalFind;
    Note.countDocuments = originalCountDocuments;
    User.distinct = originalUserDistinct;
  }
});

test("logs why notes are excluded when no searchable notes match", async () => {
  const originalNoteFind = Note.find;
  const originalNoteCountDocuments = Note.countDocuments;
  const originalNoteAggregate = Note.aggregate;
  const originalConsoleInfo = console.info;
  const diagnostics = [];
  Note.find = () => ({
    populate() { return this; },
    sort() { return this; },
    limit() { return this; },
    async lean() { return []; },
  });
  Note.countDocuments = async () => 0;
  Note.aggregate = async () => [
    {
      _id: {
        publicationStatus: "private",
        approvalDecision: "NEEDS_HUMAN_REVIEW",
        ocrStatus: "failed",
        verificationStatus: "completed",
      },
      count: 2,
    },
  ];
  console.info = (message) => diagnostics.push(JSON.parse(message.slice(18)));

  try {
    const result = await searchResources({ resourceType: "note" });
    assert.equal(result.pagination.total, 0);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0].endpoint, "GET /api/search");
    assert.equal(diagnostics[0].collections[0].name, Note.collection.name);
    assert.equal(
      diagnostics[0].excludedReason,
      "No documents satisfy the published status filters.",
    );
    assert.equal(
      diagnostics[0].collections[0].statusBreakdown[0]._id.ocrStatus,
      "failed",
    );
  } finally {
    Note.find = originalNoteFind;
    Note.countDocuments = originalNoteCountDocuments;
    Note.aggregate = originalNoteAggregate;
    console.info = originalConsoleInfo;
  }
});
