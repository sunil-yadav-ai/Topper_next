import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import Notification from "./Notification.js";

test("notifications store supported events, ownership, and read state", () => {
  const notification = new Notification({
    recipient: new mongoose.Types.ObjectId(),
    type: "mistake_resolved",
    title: "Report reviewed",
    message: "An administrator reviewed the report.",
    dedupeKey: "community-report:resolved:123",
    link: "/library",
  });
  assert.equal(notification.readAt, null);
  assert.equal(notification.validateSync(), undefined);
  assert.ok(
    new Notification({
      recipient: new mongoose.Types.ObjectId(),
      type: "unknown_event",
      title: "Title",
      message: "Message",
      dedupeKey: "event:1",
    }).validateSync().errors.type,
  );
  assert.ok(
    new Notification({
      recipient: new mongoose.Types.ObjectId(),
      type: "announcement",
      title: "Title",
      message: "Message",
      dedupeKey: "event:2",
      link: "https://example.com",
    }).validateSync().errors.link,
  );
});

test("notification ownership and event keys are indexed for deduplication and history", () => {
  const indexes = Notification.schema.indexes();
  assert.ok(
    indexes.some(
      ([fields, options]) =>
        fields.recipient === 1 &&
        fields.dedupeKey === 1 &&
        options.unique,
    ),
  );
  assert.ok(
    indexes.some(
      ([fields]) => fields.recipient === 1 && fields.createdAt === -1,
    ),
  );
});
