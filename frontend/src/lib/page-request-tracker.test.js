import assert from "node:assert/strict";
import test from "node:test";
import {
  finishPageRequest,
  getPendingPageRequestCount,
  subscribeToPageRequests,
  trackPageRequest,
} from "./page-request-tracker.js";

test("tracks concurrent page reads until every request settles", () => {
  const first = { method: "get" };
  const second = { method: "GET" };
  trackPageRequest(first);
  trackPageRequest(second);

  assert.equal(getPendingPageRequestCount(), 2);

  finishPageRequest(first);
  assert.equal(getPendingPageRequestCount(), 1);

  finishPageRequest(second);
  assert.equal(getPendingPageRequestCount(), 0);
});

test("ignores mutations and explicitly silent requests", () => {
  const mutation = { method: "post" };
  const silentRead = { method: "get", pageLoading: false };
  trackPageRequest(mutation);
  trackPageRequest(silentRead);

  assert.equal(getPendingPageRequestCount(), 0);
  assert.equal(mutation.pageLoadingTracked, undefined);
  assert.equal(silentRead.pageLoadingTracked, undefined);
});

test("settled requests notify subscribers and cannot decrement twice", () => {
  const updates = [];
  const unsubscribe = subscribeToPageRequests(() => {
    updates.push(getPendingPageRequestCount());
  });
  const request = { method: "get" };
  trackPageRequest(request);
  finishPageRequest(request);
  finishPageRequest(request);
  unsubscribe();

  assert.deepEqual(updates, [1, 0]);
  assert.equal(getPendingPageRequestCount(), 0);
});
