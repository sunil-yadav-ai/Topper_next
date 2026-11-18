import assert from "node:assert/strict";
import test from "node:test";
import { dispatchApiRequest } from "../app.js";

function request(path, init = {}) {
  return dispatchApiRequest(new Request(`http://localhost${path}`, init));
}

test("the API exposes robots.txt and a sitemap for public SEO crawlers", async () => {
  const robotsResponse = await request("/robots.txt");
  assert.equal(robotsResponse.status, 200);
  const robotsText = await robotsResponse.text();
  assert.match(robotsText, /Sitemap:/i);
  assert.match(robotsText, /Allow:/i);
  assert.match(robotsText, /Disallow: \/search/i);
  assert.match(robotsText, /Disallow: \/library/i);

  const sitemapResponse = await request("/sitemap.xml");
  assert.equal(sitemapResponse.status, 200);
  const sitemapText = await sitemapResponse.text();
  assert.match(sitemapText, /<urlset/i);
  assert.match(sitemapText, /<loc>/i);
  assert.doesNotMatch(sitemapText, /\/(?:pyqs|subjects|question-papers)(?:\/|<\/loc>)/i);
  assert.doesNotMatch(sitemapText, /\/login|\/admin|\/library|\/search/i);
});

test("SEO resource routes return a real 404 for invalid resource IDs", async () => {
  const apiResponse = await request("/api/seo/resources/note/not-an-object-id");
  assert.equal(apiResponse.status, 404);
  assert.match(apiResponse.headers.get("content-type"), /application\/json/i);

  const pageResponse = await request("/notes/not-an-object-id/computer-graphics-notes");
  assert.equal(pageResponse.status, 404);
  assert.match(pageResponse.headers.get("content-type"), /text\/html/i);
  assert.match(pageResponse.headers.get("x-robots-tag"), /noindex/i);

  const unknownPageResponse = await request("/unknown-page", {
    headers: { Accept: "text/html" },
  });
  assert.equal(unknownPageResponse.status, 404);
  assert.match(unknownPageResponse.headers.get("x-robots-tag"), /noindex/i);
});

test("removed subject and question-paper routes return 404", async () => {
  for (const path of [
    "/pyqs",
    "/subjects",
    "/subjects/computer-science",
    "/subjects/computer-science/topics/algorithms",
    "/question-papers/507f1f77bcf86cd799439011/sample-paper",
  ]) {
    const response = await request(path, {
      headers: { Accept: "text/html" },
    });
    assert.equal(response.status, 404, path);
  }
});
