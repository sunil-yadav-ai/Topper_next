import Notification from "../models/Notification.js";

export async function createNotification({
  recipient,
  type,
  title,
  message,
  link = "",
  dedupeKey,
}) {
  return Notification.findOneAndUpdate(
    { recipient, dedupeKey },
    {
      $setOnInsert: {
        recipient,
        type,
        title,
        message,
        link,
        dedupeKey,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
}
