import Follow from "../models/Follow.js";
import Notification from "../models/Notification.js";

const notificationBatchSize = 500;

export async function notifyFollowersAboutNewNote({
  uploaderId,
  uploaderName,
  noteId,
  noteTitle,
}) {
  const cursor = Follow.find({ followedUser: uploaderId })
    .select("follower")
    .lean()
    .cursor();
  const dedupeKey = `followed-note:${noteId}`;
  let batch = [];

  async function writeBatch() {
    if (!batch.length) return;
    await Notification.bulkWrite(batch, { ordered: true });
    batch = [];
  }

  for await (const { follower } of cursor) {
    batch.push({
      updateOne: {
        filter: { recipient: follower, dedupeKey },
        update: {
          $setOnInsert: {
            recipient: follower,
            type: "followed_note_uploaded",
            title: "New notes from someone you follow",
            message: `${uploaderName} uploaded "${noteTitle}".`,
            link: `/resources/note/${noteId}`,
            dedupeKey,
          },
        },
        upsert: true,
      },
    });
    if (batch.length === notificationBatchSize) await writeBatch();
  }

  await writeBatch();
}
