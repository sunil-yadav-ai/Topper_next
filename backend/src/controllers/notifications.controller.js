import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import User from "../models/User.js";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parsePage(value) {
  const page = Number(value ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000) {
    throw badRequest("Page must be a whole number between 1 and 10000.");
  }
  return page;
}

function parseLimit(value) {
  const limit = Number(value ?? 25);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw badRequest("Limit must be a whole number between 1 and 50.");
  }
  return limit;
}

function serializeNotification(notification) {
  return {
    id: notification._id.toString(),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    link: notification.link,
    isRead: Boolean(notification.readAt),
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };
}

export async function listNotifications(request, response) {
  const page = parsePage(request.query.page);
  const limit = parseLimit(request.query.limit);
  const filter = { recipient: request.user._id };
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, readAt: null }),
  ]);
  response.json({
    status: "success",
    notifications: notifications.map(serializeNotification),
    unreadCount,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function markNotificationRead(request, response) {
  if (!mongoose.isValidObjectId(request.params.notificationId)) {
    throw badRequest("Notification ID is invalid.");
  }
  const notification = await Notification.findOneAndUpdate(
    { _id: request.params.notificationId, recipient: request.user._id },
    { $set: { readAt: new Date() } },
    { new: true, runValidators: true },
  );
  if (!notification) {
    const error = new Error("Notification not found.");
    error.statusCode = 404;
    throw error;
  }
  response.json({
    status: "success",
    notification: serializeNotification(notification),
  });
}

export async function markAllNotificationsRead(request, response) {
  const result = await Notification.updateMany(
    { recipient: request.user._id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  response.json({
    status: "success",
    modifiedCount: result.modifiedCount,
  });
}

export async function deleteNotification(request, response) {
  if (!mongoose.isValidObjectId(request.params.notificationId)) {
    throw badRequest("Notification ID is invalid.");
  }
  const result = await Notification.deleteOne({
    _id: request.params.notificationId,
    recipient: request.user._id,
  });
  if (!result.deletedCount) {
    const error = new Error("Notification not found.");
    error.statusCode = 404;
    throw error;
  }
  response.json({ status: "success", message: "Notification deleted." });
}

export async function sendAdminAnnouncement(request, response) {
  const title = typeof request.body?.title === "string" ? request.body.title.trim() : "";
  const message =
    typeof request.body?.message === "string" ? request.body.message.trim() : "";
  if (!title || title.length > 120) {
    throw badRequest("Announcement title is required and must be at most 120 characters.");
  }
  if (!message || message.length > 2000) {
    throw badRequest("Announcement message is required and must be at most 2000 characters.");
  }

  const announcementId = new mongoose.Types.ObjectId();
  const recipients = User.find({
    role: "user",
    isSuspended: { $ne: true },
  })
    .select("_id")
    .lean()
    .cursor();
  let batch = [];
  let recipientCount = 0;
  for await (const user of recipients) {
    batch.push({
      updateOne: {
        filter: {
          recipient: user._id,
          dedupeKey: `announcement:${announcementId}`,
        },
        update: {
          $setOnInsert: {
            recipient: user._id,
            type: "announcement",
            title,
            message,
            link: "/notifications",
            dedupeKey: `announcement:${announcementId}`,
          },
        },
        upsert: true,
      },
    });
    if (batch.length === 500) {
      const result = await Notification.bulkWrite(batch, { ordered: true });
      recipientCount += result.upsertedCount;
      batch = [];
    }
  }
  if (batch.length) {
    const result = await Notification.bulkWrite(batch, { ordered: true });
    recipientCount += result.upsertedCount;
  }

  response.status(201).json({
    status: "success",
    message: `Announcement delivered to ${recipientCount} active student accounts.`,
    recipientCount,
  });
}
