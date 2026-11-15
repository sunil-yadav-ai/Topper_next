import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import Contribution from "../models/Contribution.js";
import RewardAccount from "../models/RewardAccount.js";
import RewardBudget from "../models/RewardBudget.js";
import RewardTransaction from "../models/RewardTransaction.js";
import { createNotification } from "./notification.service.js";

const contributionPolicies = {
  handwritten_note: {
    points: env.rewardPoints.handwrittenNote,
    title: "AI-verified handwritten notes",
  },
  pyq: {
    points: env.rewardPoints.pyq,
    title: "Published previous-year question paper",
  },
  verified_correction: {
    points: env.rewardPoints.verifiedCorrection,
    title: "Administrator-confirmed academic correction",
  },
  high_quality_resource: {
    points: env.rewardPoints.highQualityResource,
    title: "Administrator-designated high-quality resource",
  },
};
const rewardableCorrectionCategories = new Set([
  "incorrect_definition",
  "wrong_formula",
  "incorrect_calculation",
  "missing_explanation",
]);

function serviceError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function getContributionPolicy(type) {
  return contributionPolicies[type] ?? null;
}

export function isRewardableCorrectionCategory(category) {
  return rewardableCorrectionCategories.has(category);
}

export async function getRewardBudget() {
  return RewardBudget.findOneAndUpdate(
    { _id: "platform" },
    {
      $setOnInsert: {
        initialPoints: env.rewardBudgetPoints,
        availablePoints: env.rewardBudgetPoints,
        distributedPoints: 0,
        reclaimedPoints: 0,
      },
    },
    { upsert: true, new: true, runValidators: true },
  ).lean();
}

async function reserveBudget(points) {
  return RewardBudget.findOneAndUpdate(
    { _id: "platform", availablePoints: { $gte: points } },
    {
      $inc: {
        availablePoints: -points,
        distributedPoints: points,
      },
    },
    { new: true, runValidators: true },
  );
}

async function returnBudget(points) {
  await RewardBudget.updateOne(
    { _id: "platform" },
    {
      $inc: {
        availablePoints: points,
        distributedPoints: -points,
      },
    },
  );
}

async function restoreBudgetAfterDeduction(points) {
  await RewardBudget.updateOne(
    { _id: "platform" },
    {
      $inc: {
        availablePoints: -points,
        reclaimedPoints: -points,
      },
    },
  );
}

export async function awardContribution({
  userId,
  type,
  sourceType,
  sourceId,
  title,
  actorId,
  reviewerId = null,
  reason,
}) {
  const policy = getContributionPolicy(type);
  if (!policy) throw serviceError("Unsupported contribution reward type.");
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(sourceId)) {
    throw serviceError("Contribution owner or source ID is invalid.");
  }
  if (!["note", "pyq", "community_report"].includes(sourceType)) {
    throw serviceError("Unsupported contribution source.");
  }
  const safeTitle =
    typeof title === "string" && title.trim()
      ? title.trim().slice(0, 240)
      : policy.title;
  const explanation =
    typeof reason === "string" && reason.trim()
      ? reason.trim().slice(0, 500)
      : policy.title;

  await getRewardBudget();
  const contribution = await Contribution.create({
    user: userId,
    type,
    sourceType,
    sourceId,
    title: safeTitle,
    status: "unfunded",
    reviewedBy: reviewerId,
    reviewedAt: reviewerId ? new Date() : null,
  }).catch((error) => {
    if (error.code === 11000) return null;
    throw error;
  });
  if (!contribution) {
    return { awarded: false, duplicate: true, points: 0 };
  }

  const points = policy.points;
  if (points === 0) {
    return { awarded: false, duplicate: false, points: 0, unfunded: true };
  }
  let budget;
  try {
    budget = await reserveBudget(points);
  } catch (error) {
    await contribution.deleteOne();
    throw error;
  }
  if (!budget) {
    return { awarded: false, duplicate: false, points: 0, unfunded: true };
  }

  let account;
  let transaction;
  try {
    account = await RewardAccount.findOneAndUpdate(
      { user: userId },
      { $inc: { points }, $setOnInsert: { user: userId } },
      { upsert: true, new: true, runValidators: true },
    );
    transaction = await RewardTransaction.create({
      user: userId,
      type: "contribution",
      points,
      balanceAfter: account.points,
      budgetDelta: -points,
      reason: explanation,
      actor: reviewerId ?? actorId ?? null,
      contribution: contribution._id,
      sourceType,
      sourceId,
      idempotencyKey: `contribution:${type}:${sourceType}:${sourceId}`,
    });
    contribution.status = "awarded";
    contribution.pointsAwarded = points;
    contribution.rewardTransaction = transaction._id;
    await contribution.save();
    try {
      await createNotification({
        recipient: userId,
        type: "points_awarded",
        title: "Contributor points awarded",
        message: `${points} points were awarded for "${safeTitle}". ${explanation}`,
        link: "/library",
        dedupeKey: `points-awarded:${transaction._id}`,
      });
    } catch (notificationError) {
      console.error(
        `Could not create in-app points notification for transaction ${transaction._id}:`,
        notificationError,
      );
    }
    return { awarded: true, duplicate: false, points };
  } catch (error) {
    const rollbackErrors = [];
    for (const rollback of [
      () => transaction?.deleteOne(),
      () =>
        account &&
        RewardAccount.updateOne({ user: userId }, { $inc: { points: -points } }),
      () => returnBudget(points),
      () => contribution.deleteOne(),
    ]) {
      try {
        await rollback();
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      console.error("Could not roll back an incomplete contribution reward.", {
        contributionId: contribution._id.toString(),
        rollbackErrors,
      });
    }
    throw error;
  }
}

export async function adjustRewardPoints({
  userId,
  points,
  reason,
  actorId,
}) {
  if (!mongoose.isValidObjectId(userId)) {
    throw serviceError("Student ID is invalid.");
  }
  if (!Number.isSafeInteger(points) || points === 0 || Math.abs(points) > 1000) {
    throw serviceError("Point adjustment must be a non-zero whole number up to 1000.");
  }
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (!normalizedReason || normalizedReason.length > 500) {
    throw serviceError("Provide a reason of 1 to 500 characters.");
  }

  const magnitude = Math.abs(points);
  await getRewardBudget();
  const budget = points > 0 ? await reserveBudget(magnitude) : null;
  if (points > 0 && !budget) {
    throw serviceError("The platform reward budget does not have enough available points.", 409);
  }

  let account;
  let deductionBudgetUpdated = false;
  try {
    account = await RewardAccount.findOneAndUpdate(
      points > 0
        ? { user: userId }
        : { user: userId, points: { $gte: magnitude } },
      {
        $inc: { points },
        ...(points > 0 ? { $setOnInsert: { user: userId } } : {}),
      },
      {
        upsert: points > 0,
        new: true,
        runValidators: true,
      },
    );
    if (!account) {
      if (points > 0) await returnBudget(magnitude);
      throw serviceError("The student does not have enough points for this deduction.", 409);
    }

    if (points < 0) {
      await RewardBudget.updateOne(
        { _id: "platform" },
        { $inc: { availablePoints: magnitude, reclaimedPoints: magnitude } },
      );
      deductionBudgetUpdated = true;
    }
    const transaction = await RewardTransaction.create({
      user: userId,
      type: points > 0 ? "admin_award" : "admin_deduction",
      points: magnitude,
      balanceAfter: account.points,
      budgetDelta: points > 0 ? -magnitude : magnitude,
      reason: normalizedReason,
      actor: actorId,
      sourceType: "admin",
      sourceId: null,
      idempotencyKey: `admin-adjustment:${randomUUID()}`,
    });
    if (points > 0) {
      try {
        await createNotification({
          recipient: userId,
          type: "points_awarded",
          title: "Contributor points awarded",
          message: `${magnitude} points were added to your contributor balance. Reason: ${normalizedReason}`,
          link: "/library",
          dedupeKey: `points-awarded:${transaction._id}`,
        });
      } catch (notificationError) {
        console.error(
          `Could not create in-app points notification for transaction ${transaction._id}:`,
          notificationError,
        );
      }
    }
    return { account, transaction };
  } catch (error) {
    const rollbackErrors = [];
    const rollbacks = [
      () =>
        account &&
        RewardAccount.updateOne({ user: userId }, { $inc: { points: -points } }),
      () => points > 0 && budget && returnBudget(magnitude),
      () =>
        points < 0 &&
        deductionBudgetUpdated &&
        restoreBudgetAfterDeduction(magnitude),
    ];
    for (const rollback of rollbacks) {
      try {
        await rollback();
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      console.error("Could not roll back an incomplete reward adjustment.", {
        userId: userId.toString(),
        rollbackErrors,
      });
    }
    throw error;
  }
}

export async function listRewardTransactions({
  userId,
  limit = 25,
  skip = 0,
} = {}) {
  const filter = userId ? { user: userId } : {};
  return RewardTransaction.find(filter)
    .populate("user", "fullName email college university")
    .populate("actor", "fullName email role")
    .populate("contribution", "type title status")
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

export async function listRecentContributions({
  userId,
  limit = 25,
  skip = 0,
} = {}) {
  const filter = userId ? { user: userId } : {};
  return Contribution.find(filter)
    .populate("user", "fullName email college university")
    .populate("reviewedBy", "fullName")
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

export async function getRewardLeaderboard(limit = 25, currentUserId = null) {
  const accounts = await RewardAccount.find({ points: { $gt: 0 } })
    .sort({ points: -1, updatedAt: 1, _id: 1 })
    .limit(limit)
    .populate("user", "fullName college university department role")
    .lean();
  return accounts
    .filter((account) => account.user?.role !== "admin")
    .map((account, index) => ({
      rank: index + 1,
      isCurrentUser: Boolean(
        currentUserId && account.user?._id?.equals(currentUserId),
      ),
      student: account.user?.fullName ?? "Student",
      college: account.user?.college ?? "",
      university: account.user?.university ?? "",
      points: account.points,
    }));
}

export function serializeRewardTransaction(transaction) {
  return {
    id: transaction._id.toString(),
    type: transaction.type,
    points: transaction.type === "admin_deduction"
      ? -transaction.points
      : transaction.points,
    balanceAfter: transaction.balanceAfter,
    budgetDelta: transaction.budgetDelta,
    reason: transaction.reason,
    actor: transaction.actor?.fullName ?? "Platform",
    student: transaction.user?.fullName ?? "",
    studentEmail: transaction.user?.email ?? "",
    actor: transaction.actor?.fullName ?? "Platform",
    contribution: transaction.contribution
      ? {
          type: transaction.contribution.type,
          title: transaction.contribution.title,
        }
      : null,
    createdAt: transaction.createdAt,
  };
}

export function serializeContribution(contribution) {
  return {
    id: contribution._id.toString(),
    student: contribution.user?.fullName ?? "",
    studentEmail: contribution.user?.email ?? "",
    reviewer: contribution.reviewedBy?.fullName ?? "Automated approval",
    type: contribution.type,
    sourceType: contribution.sourceType,
    sourceId: contribution.sourceId.toString(),
    title: contribution.title,
    pointsAwarded: contribution.pointsAwarded,
    status: contribution.status,
    createdAt: contribution.createdAt,
  };
}
