import assert from "node:assert/strict";
import test from "node:test";

process.env.CLOUDINARY_CLOUD_NAME = "preview-test";
process.env.CLOUDINARY_API_KEY = "preview-test-key";
process.env.CLOUDINARY_API_SECRET = "preview-test-secret";

const [{ getResourceViewInfo, viewNotePreview }, { default: Note }] = await Promise.all([
  import("./resource-search.controller.js"),
  import("../models/Note.js"),
]);

test("returns only safe metadata for an accessible resource viewer", async () => {
  const originalFindById = Note.findById;
  const resource = {
    title: "Calculus notes",
    publicationStatus: "published",
    visibility: "public",
    storage: {
      format: "pdf",
      publicId: "private/storage/id",
      bytes: 2048,
    },
    uploadedBy: { fullName: "Aarav Sharma", equals: () => false },
  };
  Note.findById = () => ({
    populate: async () => resource,
  });
  const response = {
    json(payload) {
      this.payload = payload;
    },
  };

  try {
    await getResourceViewInfo(
      {
        params: { resourceType: "note", resourceId: "507f1f77bcf86cd799439011" },
        user: { _id: "507f1f77bcf86cd799439012", role: "user" },
      },
      response,
    );
    assert.deepEqual(response.payload, {
      status: "success",
      resource: {
        title: "Calculus notes",
        format: "pdf",
        uploaderName: "Aarav Sharma",
      },
    });
    assert.equal(JSON.stringify(response.payload).includes("private/storage/id"), false);
  } finally {
    Note.findById = originalFindById;
  }
});

test("does not return viewer metadata for an unauthorized private resource", async () => {
  const originalFindById = Note.findById;
  Note.findById = () => ({
    populate: async () => ({
      publicationStatus: "published",
      visibility: "private",
      uploadedBy: { fullName: "Aarav Sharma", equals: () => false },
      storage: { format: "pdf" },
    }),
  });

  try {
    await assert.rejects(
      getResourceViewInfo(
        {
          params: { resourceType: "note", resourceId: "507f1f77bcf86cd799439011" },
          user: { _id: "507f1f77bcf86cd799439012", role: "user" },
        },
        { json() {} },
      ),
      { statusCode: 404 },
    );
  } finally {
    Note.findById = originalFindById;
  }
});

test("serves only the private thumbnail asset for a public PDF note", async () => {
  const originalFindById = Note.findById;
  Note.findById = async () => ({
    _id: "507f1f77bcf86cd799439011",
    publicationStatus: "published",
    visibility: "public",
    storage: {
      format: "pdf",
      resourceType: "raw",
      publicId: "student-notes/private-original",
    },
    previewStorage: {
      format: "png",
      resourceType: "image",
      publicId: "student-notes/previews/first-page",
    },
  });
  const response = {
    headers: {},
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    redirect(status, url) {
      this.status = status;
      this.url = url;
    },
  };

  try {
    await viewNotePreview(
      { params: { resourceId: "507f1f77bcf86cd799439011" } },
      response,
    );
    assert.equal(response.status, 302);
    assert.equal(response.headers["Cross-Origin-Resource-Policy"], "cross-origin");
    const previewUrl = new URL(response.url);
    assert.equal(
      previewUrl.searchParams.get("public_id"),
      "student-notes/previews/first-page",
    );
    assert.notEqual(
      previewUrl.searchParams.get("public_id"),
      "student-notes/private-original",
    );
  } finally {
    Note.findById = originalFindById;
  }
});

test("does not serve previews of private notes to unauthenticated visitors", async () => {
  const originalFindById = Note.findById;
  Note.findById = async () => ({
    _id: "507f1f77bcf86cd799439011",
    publicationStatus: "published",
    visibility: "private",
    storage: { format: "png", resourceType: "image" },
    uploadedBy: { equals: () => false },
  });

  try {
    await assert.rejects(
      viewNotePreview(
        { params: { resourceId: "507f1f77bcf86cd799439011" } },
        {},
      ),
      { statusCode: 404 },
    );
  } finally {
    Note.findById = originalFindById;
  }
});
