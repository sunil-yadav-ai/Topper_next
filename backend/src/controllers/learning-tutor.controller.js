import mongoose from "mongoose";
import {
  answerTutorQuestion,
  endTutorSession,
  explainTutorQuestion,
  getTutorHint,
  getTutorHistory,
  nextTutorQuestion,
  startTutorSession,
} from "../services/learning-tutor.service.js";

function validateId(value, label) {
  if (mongoose.isValidObjectId(value)) return;
  const error = new Error(`${label} is invalid.`);
  error.statusCode = 400;
  throw error;
}

export async function getLearningTutorHistory(request, response) {
  validateId(request.params.noteId, "Note ID");
  const result = await getTutorHistory({
    noteId: request.params.noteId,
    user: request.user,
  });
  response.json({ status: "success", ...result });
}

export async function startLearningTutor(request, response) {
  validateId(request.params.noteId, "Note ID");
  const result = await startTutorSession({
    noteId: request.params.noteId,
    user: request.user,
  });
  response.json({ status: "success", ...result });
}

export async function answerLearningTutorQuestion(request, response) {
  validateId(request.params.sessionId, "Session ID");
  const result = await answerTutorQuestion({
    sessionId: request.params.sessionId,
    user: request.user,
    answer: request.body?.answer,
  });
  response.json({ status: "success", ...result });
}

export async function hintLearningTutorQuestion(request, response) {
  validateId(request.params.sessionId, "Session ID");
  const result = await getTutorHint({
    sessionId: request.params.sessionId,
    user: request.user,
  });
  response.json({ status: "success", ...result });
}

export async function explainLearningTutorQuestion(request, response) {
  validateId(request.params.sessionId, "Session ID");
  const result = await explainTutorQuestion({
    sessionId: request.params.sessionId,
    user: request.user,
  });
  response.json({ status: "success", ...result });
}

export async function nextLearningTutorQuestion(request, response) {
  validateId(request.params.sessionId, "Session ID");
  const result = await nextTutorQuestion({
    sessionId: request.params.sessionId,
    user: request.user,
  });
  response.json({ status: "success", ...result });
}

export async function endLearningTutorSession(request, response) {
  validateId(request.params.sessionId, "Session ID");
  const result = await endTutorSession({
    sessionId: request.params.sessionId,
    user: request.user,
  });
  response.json({ status: "success", ...result });
}
