import mongoose from "mongoose";
import User from "../models/User.js";
import {
  getStudentActivitySummary,
  recordSuccessfulResourceOpen,
} from "../services/learning-activity.service.js";
import { normalizeUsername, usernamePattern } from "../services/username.service.js";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

export async function recordLearningActivity(request, response) {
  const { resourceType, resourceId, openId } = request.body ?? {};
  const result = await recordSuccessfulResourceOpen({
    userId: request.user._id,
    resourceType,
    resourceId,
    openId,
  });
  response.status(201).json({ status: "success", ...result });
}

export async function getLearningActivity(request, response) {
  const username = normalizeUsername(request.params.username);
  if (!usernamePattern.test(username)) badRequest("Username is invalid.");
  const user = await User.findOne({ username, role: "user" }).select("_id createdAt");
  if (!user) {
    const error = new Error("Student profile not found.");
    error.statusCode = 404;
    throw error;
  }
  if (!mongoose.isValidObjectId(user._id)) {
    badRequest("Student ID is invalid.");
  }
  const activity = await getStudentActivitySummary({
    studentId: user._id,
    joinedAt: user.createdAt,
  });
  response.json({ status: "success", activity });
}
