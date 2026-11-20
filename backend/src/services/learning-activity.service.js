import mongoose from "mongoose";
import DailyLearningActivity from "../models/DailyLearningActivity.js";
import LearningActivity from "../models/LearningActivity.js";
import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";

export const activityTimeZone = "Asia/Kolkata";
const activityWindowMonths = 12;

function activityError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function getActivityDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: activityTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = Object.fromEntries(parts.map(({ type, value: text }) => [type, text]));
  return `${part.year}-${part.month}-${part.day}`;
}

export function addCalendarDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function firstDayOfMonth(dateKey) {
  return `${dateKey.slice(0, 7)}-01`;
}

function subtractCalendarMonths(dateKey, months) {
  const date = new Date(`${firstDayOfMonth(dateKey)}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

function dayDifference(startDate, endDate) {
  return Math.round(
    (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
      86_400_000,
  );
}

function monthLabels(startDate, today) {
  const labels = [];
  let date = new Date(`${firstDayOfMonth(startDate)}T00:00:00.000Z`);
  const last = new Date(`${firstDayOfMonth(today)}T00:00:00.000Z`);
  while (date <= last) {
    labels.push({
      month: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      year: date.getUTCFullYear(),
      startDate: date.toISOString().slice(0, 10),
    });
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return labels;
}

export async function recordSuccessfulResourceOpen({ userId, resourceType, resourceId, openId }) {
  if (!["note", "pyq"].includes(resourceType)) {
    throw activityError("Resource type must be note or pyq.");
  }
  if (!mongoose.isValidObjectId(resourceId)) {
    throw activityError("Resource ID is invalid.");
  }
  if (
    typeof openId !== "string" ||
    !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(openId)
  ) {
    throw activityError("Activity open ID is invalid.");
  }

  const ResourceModel = resourceType === "note" ? Note : Pyq;
  const resource = await ResourceModel.findById(resourceId)
    .select("title subject examinationYear examType publicationStatus visibility uploadedBy");
  if (!resource) throw activityError("Resource not found.", 404);
  const isPublic =
    resource.publicationStatus === "published" &&
    ["public", null, undefined].includes(resource.visibility);
  const isOwner = resource.uploadedBy?.equals(userId) ?? false;
  if (!isPublic && !isOwner) throw activityError("Resource not found.", 404);

  const openedAt = new Date();
  const activityDate = getActivityDateKey(openedAt);
  const resourceTitle = resourceType === "note"
    ? resource.title
    : resource.title || `${resource.subject} - ${resource.examinationYear} ${resource.examType}`;
  let event;
  try {
    event = await LearningActivity.create({
      userId,
      resourceId: resource._id,
      resourceType,
      resourceTitle,
      activityDate,
      openedAt,
      openId,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await LearningActivity.findOne({ userId, openId }).lean();
    if (!existing) throw error;
    return {
      activityDate: existing.activityDate,
      resourceTitle: existing.resourceTitle,
      resourceType: existing.resourceType,
    };
  }

  try {
    await DailyLearningActivity.findOneAndUpdate(
      { userId, activityDate },
      {
        $inc: {
          totalResourcesOpened: 1,
          ...(resourceType === "note" ? { notesOpened: 1 } : { pyqsOpened: 1 }),
        },
        $set: { lastOpenedAt: openedAt },
        $setOnInsert: { userId, activityDate },
      },
      { upsert: true, new: true, runValidators: true },
    );
  } catch (error) {
    if (error.code === 11000) {
      try {
        await DailyLearningActivity.findOneAndUpdate(
          { userId, activityDate },
          {
            $inc: {
              totalResourcesOpened: 1,
              ...(resourceType === "note" ? { notesOpened: 1 } : { pyqsOpened: 1 }),
            },
            $set: { lastOpenedAt: openedAt },
          },
          { new: true, runValidators: true },
        );
      } catch (retryError) {
        await removeFailedEvent(event);
        throw retryError;
      }
    } else {
      await removeFailedEvent(event);
      throw error;
    }
  }

  return { activityDate, resourceTitle, resourceType };
}

async function removeFailedEvent(event) {
  try {
    await LearningActivity.deleteOne({ _id: event._id });
  } catch (cleanupError) {
    console.error("Could not remove an incomplete learning activity event.", cleanupError);
  }
}

function countStreaks(days, today) {
  const presentDates = new Set(
    days.filter((day) => day.totalResourcesOpened > 0).map((day) => day.activityDate),
  );
  let currentStreak = 0;
  let cursor = presentDates.has(today) ? today : addCalendarDays(today, -1);
  while (presentDates.has(cursor)) {
    currentStreak += 1;
    cursor = addCalendarDays(cursor, -1);
  }

  let longestStreak = 0;
  let streak = 0;
  let previousDate = "";
  for (const day of days) {
    if (day.totalResourcesOpened <= 0) {
      streak = 0;
      previousDate = "";
      continue;
    }
    streak = previousDate && addCalendarDays(previousDate, 1) === day.activityDate
      ? streak + 1
      : 1;
    previousDate = day.activityDate;
    longestStreak = Math.max(longestStreak, streak);
  }
  return { currentStreak, longestStreak };
}

export async function getStudentActivitySummary({ studentId, joinedAt, now = new Date() }) {
  const today = getActivityDateKey(now);
  const joinedDate = getActivityDateKey(joinedAt);
  const visibleStart = subtractCalendarMonths(today, activityWindowMonths - 1);
  const windowStart = joinedDate > visibleStart ? joinedDate : visibleStart;
  const earliest = joinedDate < today ? joinedDate : today;

  const records = await LearningActivity.aggregate([
    {
      $match: {
        userId: studentId,
        activityDate: { $gte: earliest, $lte: today },
      },
    },
    {
      $group: {
        _id: "$activityDate",
        totalResourcesOpened: { $sum: 1 },
        notesOpened: {
          $sum: { $cond: [{ $eq: ["$resourceType", "note"] }, 1, 0] },
        },
        pyqsOpened: {
          $sum: { $cond: [{ $eq: ["$resourceType", "pyq"] }, 1, 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        activityDate: "$_id",
        totalResourcesOpened: 1,
        notesOpened: 1,
        pyqsOpened: 1,
      },
    },
    { $sort: { activityDate: 1 } },
  ]);
  const byDate = new Map(records.map((record) => [record.activityDate, record]));
  const days = [];
  for (let date = visibleStart; date <= today; date = addCalendarDays(date, 1)) {
    const record = byDate.get(date);
    const isBeforeJoin = date < joinedDate;
    const isToday = date === today;
    const totalResourcesOpened = record?.totalResourcesOpened ?? 0;
    days.push({
      date,
      status: isBeforeJoin
        ? "untracked"
        : totalResourcesOpened
          ? "present"
          : isToday
            ? "today"
            : "absent",
      totalResourcesOpened: isBeforeJoin ? null : totalResourcesOpened,
      notesOpened: isBeforeJoin ? null : record?.notesOpened ?? 0,
      pyqsOpened: isBeforeJoin ? null : record?.pyqsOpened ?? 0,
    });
  }

  const activeRecords = records.filter((record) => record.totalResourcesOpened > 0);
  const { currentStreak, longestStreak } = countStreaks(records, today);
  let weekStart = today;
  const todayWeekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  weekStart = addCalendarDays(today, -((todayWeekday + 6) % 7));
  const thisWeekActiveDays = activeRecords.filter(
    (record) => record.activityDate >= weekStart && record.activityDate <= today,
  ).length;
  const completedThrough = addCalendarDays(today, -1);
  const completedDays = Math.max(
    0,
    dayDifference(joinedDate, completedThrough) + 1,
  );
  const activeCompletedDays = activeRecords.filter(
    (record) => record.activityDate < today,
  ).length;
  const activityPercentage = completedDays
    ? Math.round((activeCompletedDays / completedDays) * 100)
    : activeRecords.some((record) => record.activityDate === today) ? 100 : 0;

  return {
    timeZone: activityTimeZone,
    startDate: visibleStart,
    endDate: today,
    joinedDate,
    months: monthLabels(visibleStart, today),
    days,
    summary: {
      totalActiveDays: activeRecords.length,
      totalResourcesOpened: activeRecords.reduce(
        (total, record) => total + record.totalResourcesOpened,
        0,
      ),
      totalNotesOpened: activeRecords.reduce((total, record) => total + record.notesOpened, 0),
      totalPyqsOpened: activeRecords.reduce((total, record) => total + record.pyqsOpened, 0),
      currentStreak,
      longestStreak,
      activityPercentage,
      thisWeekActiveDays,
      isCurrentDayComplete: false,
    },
    windowStart,
  };
}
