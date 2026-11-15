import mongoose from "mongoose";
import {
  answerPracticeQuestion,
  endPracticeSession,
  explainPracticeQuestion,
  getPracticeHistory,
  getPracticeHint,
  getPracticeOptions,
  nextPracticeQuestion,
  startPracticeSession,
  timeoutPracticeQuestion,
} from "../services/ai-practice.service.js";

function validateSessionId(value) {
  if (mongoose.isValidObjectId(value)) return;
  const error = new Error("Practice session ID is invalid.");
  error.statusCode = 400;
  throw error;
}

export async function getAiPracticeOptions(request, response) {
  response.json({ status: "success", ...(await getPracticeOptions({ user: request.user })) });
}

export async function getAiPracticeHistory(request, response) {
  response.json({ status: "success", ...(await getPracticeHistory({ user: request.user })) });
}

export async function startAiPractice(request, response) {
  const result = await startPracticeSession({ user: request.user, selection: request.body });
  response.status(result.available ? 201 : 409).json({ status: result.available ? "success" : "unavailable", ...result });
}

export async function answerAiPracticeQuestion(request, response) {
  validateSessionId(request.params.sessionId);
  response.json({
    status: "success",
    ...(await answerPracticeQuestion({
      sessionId: request.params.sessionId,
      user: request.user,
      questionId: request.body?.questionId,
      answer: request.body?.answer,
    })),
  });
}

export async function timeoutAiPracticeQuestion(request, response) {
  validateSessionId(request.params.sessionId);
  response.json({
    status: "success",
    ...(await timeoutPracticeQuestion({
      sessionId: request.params.sessionId,
      user: request.user,
      questionId: request.body?.questionId,
    })),
  });
}

export async function hintAiPracticeQuestion(request, response) {
  validateSessionId(request.params.sessionId);
  response.json({
    status: "success",
    ...(await getPracticeHint({ sessionId: request.params.sessionId, user: request.user })),
  });
}

export async function explainAiPracticeQuestion(request, response) {
  validateSessionId(request.params.sessionId);
  response.json({
    status: "success",
    ...(await explainPracticeQuestion({ sessionId: request.params.sessionId, user: request.user })),
  });
}

export async function nextAiPracticeQuestion(request, response) {
  validateSessionId(request.params.sessionId);
  response.json({
    status: "success",
    ...(await nextPracticeQuestion({
      sessionId: request.params.sessionId,
      user: request.user,
      questionId: request.body?.questionId,
    })),
  });
}

export async function endAiPractice(request, response) {
  validateSessionId(request.params.sessionId);
  response.json({
    status: "success",
    ...(await endPracticeSession({ sessionId: request.params.sessionId, user: request.user })),
  });
}
