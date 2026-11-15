import assert from "node:assert/strict";
import test from "node:test";
import {
  publicNoteFilter,
  publicPyqFilter,
  resourceDescription,
  resourceTitle,
  slugify,
} from "./seo.service.js";

test("SEO slugs are normalized and safe for public paths", () => {
  assert.equal(slugify("DDA Line Drawing Algorithm"), "dda-line-drawing-algorithm");
  assert.equal(slugify("  Computer Graphics  "), "computer-graphics");
});

test("SEO resource titles and descriptions use stored educational metadata", () => {
  assert.equal(
    resourceTitle({ title: "Graph Theory Notes" }, "note"),
    "Graph Theory Notes",
  );
  assert.equal(
    resourceDescription({ description: "A student-shared explanation." }, "note"),
    "A student-shared explanation.",
  );
  assert.match(
    resourceDescription({
      subject: "Database Systems",
      examinationYear: 2025,
      examType: "Final",
      course: "BCA",
      department: "Computer Science",
      university: "Example University",
    }, "pyq"),
    /2025 Final question paper for Database Systems/,
  );
});

test("SEO eligibility requires explicit public visibility and published status", () => {
  assert.deepEqual(publicNoteFilter, {
    publicationStatus: "published",
    visibility: "public",
  });
  assert.deepEqual(publicPyqFilter, {
    publicationStatus: "published",
    visibility: "public",
  });
});
