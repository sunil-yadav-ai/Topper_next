import mongoose from "mongoose";
import Contribution from "../models/Contribution.js";
import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";
import RewardAccount from "../models/RewardAccount.js";
import RewardTransaction from "../models/RewardTransaction.js";
import User from "../models/User.js";
import {
  adjustRewardPoints,
  awardContribution,
  getRewardBudget,
  getRewardLeaderboard,
  getContributionPolicy,
  listRecentContributions,
  listRewardTransactions,
  serializeContribution,
  serializeRewardTransaction,
} from "../services/reward.service.js";

const publicNotes = {
  publicationStatus: "published",
  visibility: { $in: ["public", null] },
};

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

export async function getMyRewards(request, response) {
  const userId = request.user._id;
  const page = parsePage(request.query.page);
  const limit = 25;
  const [account, transactions, contributions, leaderboard, budget, totalTransactions, totalContributions] =
    await Promise.all([
      RewardAccount.findOne({ user: userId }).lean(),
      listRewardTransactions({ userId, limit, skip: (page - 1) * limit }),
      listRecentContributions({ userId, limit, skip: (page - 1) * limit }),
      getRewardLeaderboard(25, userId),
      getRewardBudget(),
      RewardTransaction.countDocuments({ user: userId }),
      Contribution.countDocuments({ user: userId }),
    ]);

  response.json({
    status: "success",
    account: {
      points: account?.points ?? 0,
      rank: leaderboard.find((entry) => entry.isCurrentUser)?.rank ?? null,
    },
    rules: Object.entries({
      handwritten_note: getContributionPolicy("handwritten_note"),
      pyq: getContributionPolicy("pyq"),
      verified_correction: getContributionPolicy("verified_correction"),
      high_quality_resource: getContributionPolicy("high_quality_resource"),
    }).map(([type, policy]) => ({ type, ...policy })),
    budget: {
      availablePoints: budget.availablePoints,
    },
    transactions: transactions.map(serializeRewardTransaction),
    contributions: contributions.map(serializeContribution),
    historyPagination: {
      page,
      limit,
      transactionTotal: totalTransactions,
      transactionPages: Math.ceil(totalTransactions / limit),
      contributionTotal: totalContributions,
      contributionPages: Math.ceil(totalContributions / limit),
    },
    leaderboard,
  });
}

export async function getRewardsLeaderboard(_request, response) {
  response.json({
    status: "success",
    leaderboard: await getRewardLeaderboard(50),
  });
}

export async function getAdminRewardsOverview(_request, response) {
  const page = parsePage(_request.query.page);
  const limit = 50;
  const [budget, transactions, contributions, transactionTotal, contributionTotal] = await Promise.all([
    getRewardBudget(),
    listRewardTransactions({ limit, skip: (page - 1) * limit }),
    listRecentContributions({ limit, skip: (page - 1) * limit }),
    RewardTransaction.countDocuments(),
    Contribution.countDocuments(),
  ]);
  response.json({
    status: "success",
    budget: {
      initialPoints: budget.initialPoints,
      availablePoints: budget.availablePoints,
      distributedPoints: budget.distributedPoints,
      reclaimedPoints: budget.reclaimedPoints,
      lastUpdatedAt: budget.updatedAt,
    },
    transactions: transactions.map(serializeRewardTransaction),
    contributions: contributions.map(serializeContribution),
    historyPagination: {
      page,
      limit,
      transactionTotal,
      transactionPages: Math.ceil(transactionTotal / limit),
      contributionTotal,
      contributionPages: Math.ceil(contributionTotal / limit),
    },
  });
}

export async function adjustStudentRewards(request, response) {
  const { studentEmail, points, reason } = request.body ?? {};
  if (typeof studentEmail !== "string" || !studentEmail.trim()) {
    throw badRequest("Enter the student's account email.");
  }
  const student = await User.findOne({
    email: studentEmail.trim().toLowerCase(),
    role: "user",
  }).select("_id fullName email");
  if (!student) {
    const error = new Error("Student account not found.");
    error.statusCode = 404;
    throw error;
  }
  const result = await adjustRewardPoints({
    userId: student._id,
    points,
    reason,
    actorId: request.user._id,
  });
  response.status(201).json({
    status: "success",
    message:
      points > 0
        ? "Points awarded from the available platform reward budget."
        : "Points deducted with an audit record; the amount returned to the available platform budget.",
    transaction: serializeRewardTransaction({
      ...result.transaction.toObject(),
      user: student,
      actor: request.user,
    }),
    budget: await getRewardBudget(),
  });
}

export async function awardHighQualityResource(request, response) {
  const { resourceType, resourceId } = request.body ?? {};
  if (!["note", "pyq"].includes(resourceType) || !mongoose.isValidObjectId(resourceId)) {
    throw badRequest("Choose a published note or PYQ.");
  }
  const reason =
    typeof request.body.reason === "string" ? request.body.reason.trim() : "";
  if (!reason || reason.length > 500) {
    throw badRequest("Explain why this resource is high quality in 1 to 500 characters.");
  }
  const resource =
    resourceType === "note"
      ? await Note.findOne({ _id: resourceId, ...publicNotes }).select(
          "title uploadedBy",
        )
      : await Pyq.findOne({
          _id: resourceId,
          publicationStatus: "published",
          visibility: { $in: ["public", null] },
        }).select(
          "subject examinationYear uploadedBy",
        );
  if (!resource) {
    const error = new Error("Published resource not found.");
    error.statusCode = 404;
    throw error;
  }
  const outcome = await awardContribution({
    userId: resource.uploadedBy,
    actorId: resource.uploadedBy,
    reviewerId: request.user._id,
    type: "high_quality_resource",
    sourceType: resourceType,
    sourceId: resource._id,
    title:
      resourceType === "note"
        ? resource.title
        : `${resource.subject} ${resource.examinationYear} PYQ`,
    reason,
  });
  response.status(outcome.duplicate ? 200 : 201).json({
    status: "success",
    message: outcome.duplicate
      ? "This resource has already received a high-quality bonus."
      : outcome.unfunded
        ? "Resource was recognized, but the platform reward budget has no available points."
        : `${outcome.points} points awarded from the available platform reward budget.`,
    ...outcome,
  });
}
