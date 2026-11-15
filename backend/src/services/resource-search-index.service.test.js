import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNoteSearchFields,
  createSearchNgrams,
  createSearchQuery,
  scoreResourceSearch,
} from "./resource-search-index.service.js";

const flowchartNote = {
  title: "Flowchart Drawing",
  subject: "Computer Science",
  topic: "Draw a Flowchart",
  description: "How to draw a flowchart step by step",
  searchNgrams: createSearchNgrams([
    "Flowchart Drawing",
    "Computer Science",
    "Draw a Flowchart",
    "How to draw a flowchart step by step",
  ]),
};

test("finds the same flowchart note across the requested spelling and spacing variants", () => {
  for (const search of [
    "Draw a Flowchart",
    "drow a flow chart",
    "drwa flowchart",
    "flowchrt",
    "flow chart",
    "draw flow char",
  ]) {
    const result = scoreResourceSearch(flowchartNote, createSearchQuery(search));
    assert.ok(result.rank > 0, `"${search}" should match the flowchart resource`);
  }
});

test("searches encrypted OCR content through its derived ngram index", () => {
  const ocrFields = buildNoteSearchFields(
    { title: "Lecture notes", subject: "Physics" },
    { pages: [{ extractedText: "Draw a Flowchart", recognizedFormulas: [] }] },
  );
  const ocrOnlyNote = {
    title: "Lecture notes",
    subject: "Physics",
    searchNgrams: createSearchNgrams(ocrFields),
  };
  for (const search of ["drow a flow chart", "drwa flowchart", "flowchrt"]) {
    assert.ok(
      scoreResourceSearch(ocrOnlyNote, createSearchQuery(search)).rank > 0,
      `"${search}" should match indexed OCR text`,
    );
  }
});

test("ranks exact text above typos, partial matches, and local semantic aliases", () => {
  const exact = scoreResourceSearch(
    flowchartNote,
    createSearchQuery("draw a flowchart"),
  );
  const typo = scoreResourceSearch(
    flowchartNote,
    createSearchQuery("drow a flowchart"),
  );
  const partial = scoreResourceSearch(
    flowchartNote,
    createSearchQuery("flowch"),
  );
  const semantic = scoreResourceSearch(
    flowchartNote,
    createSearchQuery("diagram"),
  );
  assert.ok(exact.rank > typo.rank);
  assert.ok(typo.rank > partial.rank);
  assert.ok(partial.rank > semantic.rank);
});

test("does not match unrelated resources on a single shared word", () => {
  const unrelated = {
    title: "Introduction to Fluid Mechanics",
    subject: "Physics",
    description: "A quick drawing of flow in a pipe",
    searchNgrams: createSearchNgrams([
      "Introduction to Fluid Mechanics",
      "Physics",
      "A quick drawing of flow in a pipe",
    ]),
  };
  const result = scoreResourceSearch(
    unrelated,
    createSearchQuery("draw a flow chart"),
  );
  assert.equal(result.rank, 0);
});
