import Follow from "../models/Follow.js";
import User from "../models/User.js";
import { normalizeUsername, usernamePattern } from "../services/username.service.js";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFound() {
  const error = new Error("Student profile not found.");
  error.statusCode = 404;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

async function findFollowTarget(value) {
  const username = normalizeUsername(value);
  if (!usernamePattern.test(username)) throw badRequest("Username is invalid.");
  const user = await User.findOne({ username, role: "user" }).select("_id isSuspended");
  if (!user) throw notFound();
  return user;
}

async function sendFollowState(response, followedUserId, isFollowing) {
  const followerCount = await Follow.countDocuments({ followedUser: followedUserId });
  response.json({
    status: "success",
    isFollowing,
    followerCount,
  });
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

async function listConnections(request, response, direction) {
  const profile = await findFollowTarget(request.params.username);
  const page = parsePage(request.query?.page);
  const limit = parseLimit(request.query?.limit);
  const isFollowers = direction === "followers";
  const filter = isFollowers
    ? { followedUser: profile._id }
    : { follower: profile._id };
  const edgeField = isFollowers ? "follower" : "followedUser";
  const [total, edges] = await Promise.all([
    Follow.countDocuments(filter),
    Follow.find(filter)
      .select(edgeField)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  const userIds = edges.map((edge) => edge[edgeField]);
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds }, role: "user" })
      .select("fullName username avatarUrl")
      .lean()
    : [];
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  response.json({
    status: "success",
    users: userIds
      .map((id) => usersById.get(String(id)))
      .filter(Boolean)
      .map((user) => ({
        id: user._id.toString(),
        fullName: user.fullName,
        username: user.username,
        avatarUrl: user.avatarUrl ?? "",
      })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function followUser(request, response) {
  const followedUser = await findFollowTarget(request.params.username);
  if (String(followedUser._id) === String(request.user._id)) {
    throw conflict("You cannot follow your own profile.");
  }
  if (followedUser.isSuspended) throw notFound();

  const filter = {
    follower: request.user._id,
    followedUser: followedUser._id,
  };
  try {
    await Follow.updateOne(
      filter,
      { $setOnInsert: filter },
      { upsert: true, runValidators: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  await sendFollowState(response, followedUser._id, true);
}

export async function unfollowUser(request, response) {
  const followedUser = await findFollowTarget(request.params.username);
  if (String(followedUser._id) === String(request.user._id)) {
    throw conflict("You cannot unfollow your own profile.");
  }

  await Follow.deleteOne({
    follower: request.user._id,
    followedUser: followedUser._id,
  });
  await sendFollowState(response, followedUser._id, false);
}

export async function listFollowers(request, response) {
  await listConnections(request, response, "followers");
}

export async function listFollowing(request, response) {
  await listConnections(request, response, "following");
}
