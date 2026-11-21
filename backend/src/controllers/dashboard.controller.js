import mongoose from "mongoose";
import Activity from "../models/Activity.js";
import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";
import Resource from "../models/Resource.js";
import User from "../models/User.js";
import Bookmark from "../models/Bookmark.js";
import StudentResourceAccess from "../models/StudentResourceAccess.js";

const profileFields = [
  "fullName",
  "university",
  "department",
  "batch",
  "semester",
  "avatarUrl",
];

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function formatResourceActivity(resource) {
  const event = {
    id: `resource-uploaded-${resource.id}`,
    type: "resource_uploaded",
    description: `Uploaded "${resource.title}"`,
    createdAt: resource.createdAt,
  };

  if (
    resource.status !== "pending" &&
    resource.updatedAt.getTime() > resource.createdAt.getTime()
  ) {
    return [
      event,
      {
        id: `resource-${resource.status}-${resource.id}`,
        type: `resource_${resource.status}`,
        description: `${resource.status === "approved" ? "Approved" : "Rejected"} "${resource.title}"`,
        createdAt: resource.updatedAt,
      },
    ];
  }

  return [event];
}

function formatStoredActivity(activity) {
  const descriptions = {
    profile_updated: "Updated your profile",
    resource_saved: `Saved "${activity.resourceTitle}"`,
    resource_unsaved: `Removed "${activity.resourceTitle}" from saved resources`,
  };

  return {
    id: activity.id,
    type: activity.type,
    description: descriptions[activity.type],
    createdAt: activity.createdAt,
  };
}

export async function getStudentDashboard(request, response) {
  const userId = request.user._id;
  const profile = await User.findById(userId).select("+savedResources");
  if (!profile) {
    const error = new Error("Student profile was not found.");
    error.statusCode = 404;
    throw error;
  }

  const [
    resourceStatsResult,
    noteStatsResult,
    pyqStatsResult,
    downloadStatsResult,
    savedResources,
    storedActivities,
    recentResources,
    libraryBookmarkCount,
  ] =
    await Promise.all([
      Resource.aggregate([
        { $match: { uploadedBy: userId } },
        {
          $group: {
            _id: null,
            totalUploadedNotes: {
              $sum: { $cond: [{ $eq: ["$type", "note"] }, 1, 0] },
            },
            totalUploadedPyqs: {
              $sum: { $cond: [{ $eq: ["$type", "pyq"] }, 1, 0] },
            },
            approvedResources: {
              $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
            },
            rejectedResources: {
              $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
            },
            pendingVerification: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            contributorPoints: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "approved"] },
                  { $ifNull: ["$pointsAwarded", 0] },
                  0,
                ],
              },
            },
          },
        },
      ]),
      Note.aggregate([
        { $match: { uploadedBy: userId } },
        {
          $group: {
            _id: null,
            totalUploadedNotes: { $sum: 1 },
            pendingVerification: {
              $sum: {
                $cond: [
                  { $in: ["$verificationStatus", ["queued", "processing"]] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      Pyq.aggregate([
        { $match: { uploadedBy: userId } },
        { $group: { _id: null, totalUploadedPyqs: { $sum: 1 } } },
      ]),
      StudentResourceAccess.aggregate([
        { $match: { user: userId } },
        {
          $group: {
            _id: null,
            totalDownloads: { $sum: { $ifNull: ["$downloadCount", 0] } },
          },
        },
      ]),
      Resource.find({
        _id: { $in: profile.savedResources },
        status: "approved",
      })
        .select("title type uploadedBy createdAt")
        .populate("uploadedBy", "fullName")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Activity.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Resource.find({ uploadedBy: userId })
        .select("title type status createdAt updatedAt")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Bookmark.countDocuments({ user: userId }),
    ]);

  const resourceStats = resourceStatsResult[0] ?? {};
  const noteStats = noteStatsResult[0] ?? {};
  const pyqStats = pyqStatsResult[0] ?? {};
  const downloadStats = downloadStatsResult[0] ?? {};
  const savedResourceIds = profile.savedResources.map((id) => id.toString());
  const recentActivity = [
    ...storedActivities.map(formatStoredActivity),
    ...recentResources.flatMap(formatResourceActivity),
  ]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 10);
  if (recentActivity.length < 10) {
    recentActivity.push({
      id: `account-created-${profile.id}`,
      type: "account_created",
      description: "Joined StudyShare",
      createdAt: profile.createdAt,
    });
    recentActivity.sort((left, right) => right.createdAt - left.createdAt);
    recentActivity.splice(10);
  }

  response.json({
    status: "success",
    profile: profile.toSafeObject(),
    stats: {
      totalUploadedNotes:
        (resourceStats.totalUploadedNotes ?? 0) + (noteStats.totalUploadedNotes ?? 0),
      totalUploadedPyqs:
        (resourceStats.totalUploadedPyqs ?? 0) + (pyqStats.totalUploadedPyqs ?? 0),
      totalDownloads: downloadStats.totalDownloads ?? 0,
      myContributions:
        (resourceStats.totalUploadedNotes ?? 0) +
        (resourceStats.totalUploadedPyqs ?? 0) +
        (noteStats.totalUploadedNotes ?? 0) +
        (pyqStats.totalUploadedPyqs ?? 0),
      approvedResources: resourceStats.approvedResources ?? 0,
      rejectedResources: resourceStats.rejectedResources ?? 0,
      pendingVerification:
        (resourceStats.pendingVerification ?? 0) + (noteStats.pendingVerification ?? 0),
      contributorPoints: resourceStats.contributorPoints ?? 0,
      savedResources: savedResources.length + libraryBookmarkCount,
    },
    savedResources: savedResources.map((resource) => ({
      id: resource._id.toString(),
      title: resource.title,
      type: resource.type,
      uploadedBy: resource.uploadedBy?.fullName ?? "Student",
      createdAt: resource.createdAt,
    })),
    recentActivity,
    savedResourceIds,
  });
}

export async function updateStudentProfile(request, response) {
  const updates = request.body ?? {};
  const requestedFields = Object.keys(updates);

  if (requestedFields.length === 0 || requestedFields.some((field) => !profileFields.includes(field))) {
    throw badRequest("Only profile fields may be updated.");
  }

  const user = request.user;
  for (const field of requestedFields) {
    const value = updates[field];
    if (field === "semester") {
      const semester = Number(value);
      if (!Number.isInteger(semester) || semester < 1 || semester > 12) {
        throw badRequest("Semester must be a whole number from 1 to 12.");
      }
      user.semester = semester;
      continue;
    }

    if (typeof value !== "string") {
      throw badRequest(`${field} must be a string.`);
    }
    const normalized = value.trim();
    if (field !== "avatarUrl" && !normalized) {
      throw badRequest(`${field} cannot be empty.`);
    }
    if (field === "avatarUrl" && normalized) {
      let avatarUrl;
      try {
        avatarUrl = new URL(normalized);
      } catch {
        throw badRequest("Profile picture must be a valid HTTP or HTTPS URL.");
      }
      if (!["http:", "https:"].includes(avatarUrl.protocol)) {
        throw badRequest("Profile picture must use HTTP or HTTPS.");
      }
    }
    user[field] = normalized;
  }

  await user.save();
  await Activity.create({ user: user._id, type: "profile_updated" });
  response.json({ status: "success", profile: user.toSafeObject() });
}

export async function saveStudentResource(request, response) {
  const { resourceId } = request.params;
  if (!mongoose.isValidObjectId(resourceId)) {
    throw badRequest("Resource ID is invalid.");
  }

  const resource = await Resource.findOne({ _id: resourceId, status: "approved" })
    .select("title");
  if (!resource) {
    const error = new Error("Approved resource was not found.");
    error.statusCode = 404;
    throw error;
  }

  const user = await User.findById(request.user._id).select("+savedResources");
  const alreadySaved = user.savedResources.some((id) => id.equals(resource._id));
  if (!alreadySaved) {
    user.savedResources.addToSet(resource._id);
    await user.save();
    await Activity.create({
      user: user._id,
      type: "resource_saved",
      resource: resource._id,
      resourceTitle: resource.title,
    });
  }

  response.json({ status: "success", message: "Resource saved." });
}

export async function unsaveStudentResource(request, response) {
  const { resourceId } = request.params;
  if (!mongoose.isValidObjectId(resourceId)) {
    throw badRequest("Resource ID is invalid.");
  }

  const user = await User.findById(request.user._id).select("+savedResources");
  const index = user.savedResources.findIndex((id) => id.toString() === resourceId);
  if (index >= 0) {
    const [savedId] = user.savedResources.splice(index, 1);
    const resource = await Resource.findById(savedId).select("title");
    await user.save();
    await Activity.create({
      user: user._id,
      type: "resource_unsaved",
      resource: savedId,
      resourceTitle: resource?.title ?? "resource",
    });
  }

  response.json({ status: "success", message: "Resource removed from saved resources." });
}
