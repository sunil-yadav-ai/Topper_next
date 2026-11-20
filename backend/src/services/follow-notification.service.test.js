import assert from "node:assert/strict";
import test from "node:test";
import Follow from "../models/Follow.js";
import Notification from "../models/Notification.js";
import { notifyFollowersAboutNewNote } from "./follow-notification.service.js";

test("notifies followers with a link to each newly uploaded note", async () => {
  const uploaderId = "uploader-id";
  const followers = [{ follower: "follower-1" }, { follower: "follower-2" }];
  const originalFind = Follow.find;
  const originalBulkWrite = Notification.bulkWrite;
  let operations;
  Follow.find = (filter) => {
    assert.deepEqual(filter, { followedUser: uploaderId });
    return {
      select(fields) {
        assert.equal(fields, "follower");
        return this;
      },
      lean() {
        return this;
      },
      cursor() {
        return {
          async *[Symbol.asyncIterator]() {
            yield* followers;
          },
        };
      },
    };
  };
  Notification.bulkWrite = async (batch, options) => {
    operations = batch;
    assert.deepEqual(options, { ordered: true });
  };

  try {
    await notifyFollowersAboutNewNote({
      uploaderId,
      uploaderName: "Ada Student",
      noteId: "note-123",
      noteTitle: "Graph Theory",
    });
    assert.equal(operations.length, 2);
    assert.deepEqual(operations[0].updateOne.filter, {
      recipient: "follower-1",
      dedupeKey: "followed-note:note-123",
    });
    assert.equal(
      operations[0].updateOne.update.$setOnInsert.type,
      "followed_note_uploaded",
    );
    assert.equal(
      operations[1].updateOne.update.$setOnInsert.message,
      'Ada Student uploaded "Graph Theory".',
    );
    assert.equal(
      operations[0].updateOne.update.$setOnInsert.link,
      "/resources/note/note-123",
    );
  } finally {
    Follow.find = originalFind;
    Notification.bulkWrite = originalBulkWrite;
  }
});
