import LearningSession from "../models/LearningSession.js";
import Note from "../models/Note.js";
import { generateStructuredContent } from "./gemini-ai.service.js";

const difficultyOrder = ["easy", "medium", "hard", "advanced"];
const quizQuestionCount = 10;
const genericWords = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "does", "what",
  "when", "once", "used", "uses", "are", "was", "can", "how", "has", "have", "will",
]);

const questionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    question: { type: "string" },
    concept: { type: "string" },
    type: { type: "string", enum: ["mcq"] },
    choices: { type: "array", items: { type: "string" } },
    answerKey: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
  },
  required: ["question", "concept", "type", "choices", "answerKey", "keyPoints"],
};

const textSchema = {
  type: "object",
  additionalProperties: false,
  properties: { text: { type: "string" } },
  required: ["text"],
};

function tutorError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isQuizSession(session) {
  return session.totalQuestions === quizQuestionCount &&
    session.questions.length > 0 &&
    session.questions.length < quizQuestionCount &&
    session.questions.every((question) => question.type === "mcq");
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function readWords(value) {
  return new Set(
    String(value)
      .toLowerCase()
      .match(/[a-z][a-z0-9_+-]{2,}/g) ?? [],
  );
}

export async function requestStructuredOutput({
  instructions,
  input,
  schema,
  maxOutputTokens = 900,
  userId,
  feature = "tutor",
}) {
  const { result } = await generateStructuredContent({
    feature,
    userId,
    instructions,
    contents: [{
      role: "user",
      parts: [{ text: JSON.stringify(input) }],
    }],
    schema,
    maxOutputTokens,
    timeoutMs: 45_000,
  });
  return result;
}

async function findAccessibleNote(noteId, user) {
  const note = await Note.findById(noteId);
  if (!note) throw tutorError("Resource not found.", 404);
  const isPublic =
    note.publicationStatus === "published" &&
    ["public", null, undefined].includes(note.visibility);
  const isOwner = note.uploadedBy?.equals(user._id) ?? false;
  if (!isPublic && !isOwner && user.role !== "admin") {
    throw tutorError("Resource not found.", 404);
  }
  return note;
}

function getLearningSource(note) {
  const subject = note.subject || note.department;
  const topic = [
    note.topic,
    note.unit,
    note.title,
    ...(note.keywords ?? []),
    ...(note.tags ?? []),
    note.description,
  ].find((value) =>
    typeof value === "string" &&
    value.trim() &&
    !/^(notes?|study material|educational resource)$/i.test(value.trim()),
  );
  const resolvedSubject = typeof subject === "string" ? subject.trim() : "";
  const resolvedTopic = typeof topic === "string" ? topic.trim().slice(0, 160) : "";
  if (!resolvedSubject || !resolvedTopic) {
    return {
      available: false,
      message: "We could not identify a subject or topic from this resource's details, so the quiz cannot be generated.",
    };
  }
  return {
    available: true,
    subject: resolvedSubject,
    topic: resolvedTopic,
  };
}

export function nextDifficulty({ difficulty, isCorrect, questionType, mcqCorrectStreak }) {
  const index = difficultyOrder.indexOf(difficulty);
  if (!isCorrect) {
    return {
      difficulty: difficulty === "easy" ? "easy" : difficultyOrder[Math.max(0, index - (difficulty === "advanced" ? 2 : 1))],
      reason: "Reinforce the same concept at a gentler level after an incorrect answer.",
    };
  }
  if (questionType === "mcq" && mcqCorrectStreak < 2) {
    return {
      difficulty,
      reason: "Keep the challenge steady until more than one multiple-choice answer is correct.",
    };
  }
  return {
    difficulty: difficultyOrder[Math.min(difficultyOrder.length - 1, index + 1)],
    reason: difficultyOrder[Math.min(difficultyOrder.length - 1, index + 1)] === difficulty
      ? "Continue with advanced reasoning after a correct answer."
      : "Increase the challenge after a correct answer.",
  };
}

function validateQuestion(question, source, previousQuestions, requestedConcept) {
  if (
    !question ||
    !nonEmpty(question.question) ||
    question.question.length > 1200 ||
    !nonEmpty(question.concept) ||
    question.concept.length > 160 ||
    question.type !== "mcq" ||
    !nonEmpty(question.answerKey) ||
    question.answerKey.length > 2000 ||
    !Array.isArray(question.choices) ||
    question.choices.length > 5 ||
    question.choices.some((choice) => !nonEmpty(choice) || choice.length > 300) ||
    !Array.isArray(question.keyPoints) ||
    question.keyPoints.length === 0 ||
    question.keyPoints.length > 8 ||
    question.keyPoints.some((point) => !nonEmpty(point) || point.length > 300)
  ) {
    throw tutorError("The AI tutor generated an incomplete question. Please try again.");
  }
  if (question.type === "mcq") {
    if (
      question.choices.length !== 4 ||
      new Set(question.choices.map((choice) => choice.trim())).size !== 4 ||
      question.choices.some((choice) => !nonEmpty(choice) || choice.length > 300) ||
      !question.choices.some((choice) => choice.trim() === question.answerKey.trim())
    ) {
      throw tutorError("The AI tutor generated an invalid multiple-choice question. Please try again.");
    }
  }
  if (requestedConcept && !sameConcept(question.concept, requestedConcept)) {
    throw tutorError("The AI tutor did not keep the question on the concept being reinforced. Please try again.");
  }
  const normalized = normalizeQuestion(question.question);
  if (previousQuestions.some((previous) => normalizeQuestion(previous) === normalized)) {
    throw tutorError("The AI tutor generated a repeated question. Please try again.");
  }
}

function normalizeQuestion(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sameConcept(first, second) {
  const normalize = (value) => [...readWords(value)]
    .filter((word) => !genericWords.has(word))
    .map((word) => (word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word));
  const requestedWords = normalize(second);
  const matchingWords = normalize(first).filter((word) => requestedWords.includes(word));
  return matchingWords.length >= Math.min(2, requestedWords.length);
}

function publicQuestion(question) {
  return {
    id: question._id,
    question: question.question,
    concept: question.concept,
    difficulty: question.difficulty,
    type: question.type,
    choices: question.choices,
    studentAnswer: question.studentAnswer,
    isCorrect: question.isCorrect,
    feedback: question.feedback,
    explanation: question.explanation,
    workedExample: question.workedExample,
    hintText: question.hintText,
    explainAgain: question.explainAgain,
    answeredAt: question.answeredAt,
    skipped: question.skipped,
  };
}

export function serializeLearningSession(session) {
  const questionsAnswered = session.questions.filter((question) => question.answeredAt).length;
  return {
    id: session._id,
    resourceId: session.resource,
    resourceTitle: session.resourceTitle,
    subject: session.subject,
    topic: session.topic,
    status: session.status,
    totalQuestions: session.totalQuestions ?? quizQuestionCount,
    questionsAnswered,
    scorePercent: questionsAnswered
      ? Math.round((session.correctCount / questionsAnswered) * 100)
      : 0,
    currentDifficulty: session.currentDifficulty,
    currentConcept: session.currentConcept,
    correctCount: session.correctCount,
    incorrectCount: session.incorrectCount,
    correctStreak: session.correctStreak,
    incorrectStreak: session.incorrectStreak,
    strongConcepts: session.strongConcepts,
    weakConcepts: session.weakConcepts,
    conceptMastery: session.conceptMastery,
    difficultyChanges: session.difficultyChanges,
    questions: session.questions.map(publicQuestion),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt,
  };
}

function questionPrompt(session, source, difficulty, concept) {
  return {
    subject: source.subject,
    topic: source.topic,
    task: "Ask exactly one new multiple-choice question strictly about the supplied topic. The subject provides context only; do not ask about other subjects or unrelated topics. Use general educational knowledge, not uploaded documents.",
    difficulty,
    requestedConcept: concept || "",
    previousQuestions: session.questions.slice(-30).map(({ question }) => question),
    studentHistory: {
      correctCount: session.correctCount,
      incorrectCount: session.incorrectCount,
      weakConcepts: session.weakConcepts,
      strongConcepts: session.strongConcepts,
      recentAnswers: session.questions
        .filter((question) => question.answeredAt)
        .slice(-12)
        .map((question) => ({
          concept: question.concept,
          question: question.question,
          answer: question.studentAnswer.slice(0, 400),
          correct: question.isCorrect,
          feedback: question.feedback.slice(0, 240),
          difficulty: question.difficulty,
        })),
    },
  };
}

async function generateQuestion(session, source, difficulty, userId, concept = "") {
  const question = await requestStructuredOutput({
    instructions:
      "You are a careful, friendly teacher preparing a 10-question multiple-choice quiz. Generate exactly one educationally accurate MCQ only about the given topic; do not drift to other topics. The subject is context only. " +
      "Use exactly four distinct plausible choices and set answerKey to exactly one choice. " +
      "Do not repeat or merely rephrase previous questions. Keep the requested concept when one is specified. " +
      "At easy, ask a simple recall question; at medium, ask for a simple application; at hard, ask for reasoning; at advanced, ask a challenging application. " +
      "Make the answer key and key points factually accurate for the topic. Do not include the answer in the question.",
    input: questionPrompt(session, source, difficulty, concept),
    schema: questionSchema,
    userId,
  });
  validateQuestion(
    question,
    source,
    session.questions.map(({ question: asked }) => asked),
    concept,
  );
  return { ...question, difficulty, type: "mcq" };
}

function updateConceptMastery(session, concept, isCorrect) {
  let mastery = session.conceptMastery.find((item) => item.concept.toLowerCase() === concept.toLowerCase());
  if (!mastery) {
    mastery = { concept, correct: 0, incorrect: 0, mastery: 0 };
    session.conceptMastery.push(mastery);
  }
  if (isCorrect) mastery.correct += 1;
  else mastery.incorrect += 1;
  const total = mastery.correct + mastery.incorrect;
  mastery.mastery = total ? Math.round((mastery.correct / total) * 100) : 0;
  session.strongConcepts = session.strongConcepts.filter((item) => item.toLowerCase() !== concept.toLowerCase());
  session.weakConcepts = session.weakConcepts.filter((item) => item.toLowerCase() !== concept.toLowerCase());
  if (mastery.correct >= 2 && mastery.mastery >= 75) session.strongConcepts.push(concept);
  if (mastery.incorrect >= 1 && mastery.mastery < 60) session.weakConcepts.push(concept);
  session.markModified("conceptMastery");
}

async function ensureActiveSession(sessionId, studentId) {
  const session = await LearningSession.findOne({
    _id: sessionId,
    student: studentId,
    status: "active",
  });
  if (!session) throw tutorError("This learning session is not available.", 404);
  return session;
}

async function saveSession(session) {
  try {
    await session.save();
  } catch (error) {
    if (error.name === "VersionError") {
      throw tutorError("This learning session changed in another request. Refresh the page and continue.", 409);
    }
    throw error;
  }
}

async function getSessionSource(session) {
  const note = await Note.findById(session.resource);
  if (!note) throw tutorError("The note for this learning session is no longer available.", 404);
  const source = getLearningSource(session);
  if (!source.available) throw tutorError(source.message, 409);
  return source;
}

export async function getTutorHistory({ noteId, user }) {
  const note = await findAccessibleNote(noteId, user);
  const [foundActive, completed] = await Promise.all([
    LearningSession.findOne({ student: user._id, resource: note._id, status: "active" }),
    LearningSession.find({ student: user._id, resource: note._id, status: "completed" })
      .sort({ updatedAt: -1 })
      .limit(5),
  ]);
  let active = foundActive;
  if (active && !isQuizSession(active)) {
    active.status = "completed";
    active.completedAt = new Date();
    await saveSession(active);
    active = null;
  }
  const source = getLearningSource(note);
  return {
    available: source.available,
    unavailableMessage: source.available ? "" : source.message,
    subject: source.subject,
    topic: source.topic,
    activeSession: active ? serializeLearningSession(active) : null,
    previousSessions: completed.map((session) => ({
      id: session._id,
      correctCount: session.correctCount,
      incorrectCount: session.incorrectCount,
      questionsAsked: session.questions.filter((question) => question.answeredAt).length,
      totalQuestions: session.totalQuestions ?? quizQuestionCount,
      scorePercent: serializeLearningSession(session).scorePercent,
      strongConcepts: session.strongConcepts,
      weakConcepts: session.weakConcepts,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
    })),
  };
}

export async function startTutorSession({ noteId, user }) {
  const note = await findAccessibleNote(noteId, user);
  let active = await LearningSession.findOne({
    student: user._id,
    resource: note._id,
    status: "active",
  });
  if (active) {
    if (isQuizSession(active)) {
      return { available: true, session: serializeLearningSession(active), resumed: true };
    }
    active.status = "completed";
    active.completedAt = new Date();
    await saveSession(active);
    active = null;
  }

  const source = getLearningSource(note);
  if (!source.available) return { available: false, message: source.message };
  const draft = {
    questions: [],
    correctCount: 0,
    incorrectCount: 0,
    strongConcepts: [],
    weakConcepts: [],
  };
  const firstQuestion = await generateQuestion(draft, source, "easy", user._id);
  let session;
  try {
    session = await LearningSession.create({
      student: user._id,
      resource: note._id,
      resourceTitle: note.title,
      subject: source.subject,
      topic: source.topic,
      currentDifficulty: "easy",
      totalQuestions: quizQuestionCount,
      currentConcept: firstQuestion.concept,
      questions: [firstQuestion],
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const concurrentSession = await LearningSession.findOne({
      student: user._id,
      resource: note._id,
      status: "active",
    });
    if (!concurrentSession) throw error;
    return {
      available: true,
      session: serializeLearningSession(concurrentSession),
      resumed: true,
    };
  }
  return { available: true, session: serializeLearningSession(session), resumed: false };
}

export async function answerTutorQuestion({ sessionId, user, answer }) {
  const session = await ensureActiveSession(sessionId, user._id);
  const currentQuestion = [...session.questions].reverse().find((question) => !question.answeredAt && !question.skipped);
  if (!currentQuestion) throw tutorError("There is no unanswered question in this session.", 409);
  if (
    typeof answer !== "string" ||
    !currentQuestion.choices.some((choice) => choice === answer)
  ) {
    throw tutorError("Choose one of the listed options.", 400);
  }

  const isCorrect = answer === currentQuestion.answerKey;
  const oldDifficulty = session.currentDifficulty;
  currentQuestion.studentAnswer = answer;
  currentQuestion.isCorrect = isCorrect;
  currentQuestion.feedback = isCorrect ? "Correct!" : "Not quite.";
  currentQuestion.explanation = isCorrect
    ? ""
    : `The correct answer is: ${currentQuestion.answerKey}`;
  currentQuestion.answeredAt = new Date();
  const concept = currentQuestion.concept;
  if (isCorrect) {
    session.correctCount += 1;
    session.correctStreak += 1;
    session.incorrectStreak = 0;
    session.mcqCorrectStreak += 1;
  } else {
    session.incorrectCount += 1;
    session.incorrectStreak += 1;
    session.correctStreak = 0;
    session.mcqCorrectStreak = 0;
  }
  updateConceptMastery(session, concept, isCorrect);
  const adjustment = nextDifficulty({
    difficulty: oldDifficulty,
    isCorrect,
    questionType: "mcq",
    mcqCorrectStreak: session.mcqCorrectStreak,
  });
  session.currentDifficulty = adjustment.difficulty;
  if (oldDifficulty !== adjustment.difficulty) {
    session.difficultyChanges.push({
      from: oldDifficulty,
      to: adjustment.difficulty,
      reason: adjustment.reason,
    });
  }
  let nextQuestionError = "";
  if (session.questions.length >= (session.totalQuestions ?? quizQuestionCount)) {
    session.status = "completed";
    session.completedAt = new Date();
  } else {
    await saveSession(session);
    try {
      const source = await getSessionSource(session);
      const followUpConcept = isCorrect ? "" : concept;
      const nextQuestion = await generateQuestion(
        session,
        source,
        adjustment.difficulty,
        user._id,
        followUpConcept,
      );
      session.questions.push(nextQuestion);
      session.currentConcept = nextQuestion.concept;
    } catch (error) {
      if (!Number.isInteger(error.statusCode) || error.statusCode < 400) throw error;
      nextQuestionError = error.message;
    }
  }
  await saveSession(session);
  return {
    session: serializeLearningSession(session),
    nextQuestionError,
  };
}

export async function getTutorHint({ sessionId, user }) {
  const session = await ensureActiveSession(sessionId, user._id);
  const currentQuestion = [...session.questions].reverse().find((question) => !question.answeredAt && !question.skipped);
  if (!currentQuestion) throw tutorError("There is no active question to hint.", 409);
  if (!currentQuestion.hintText) {
    const source = await getSessionSource(session);
    const result = await requestStructuredOutput({
      instructions:
        "Give one brief, helpful hint for this question using only the supplied subject and topic. Do not reveal the answer.",
      input: {
        subject: source.subject,
        topic: source.topic,
        question: currentQuestion.question,
        concept: currentQuestion.concept,
      },
      schema: textSchema,
      maxOutputTokens: 250,
      userId: user._id,
    });
    if (!result || !nonEmpty(result.text)) {
      throw tutorError("The AI tutor could not create a hint. Please try again.");
    }
    currentQuestion.hintText = result.text.slice(0, 800);
    await saveSession(session);
  }
  return { session: serializeLearningSession(session), hint: currentQuestion.hintText };
}

export async function explainTutorQuestion({ sessionId, user }) {
  const session = await ensureActiveSession(sessionId, user._id);
  const currentQuestion = [...session.questions].reverse().find((question) => !question.skipped);
  if (!currentQuestion) throw tutorError("There is no question to explain.", 409);
  if (!currentQuestion.explainAgain) {
    const source = await getSessionSource(session);
    const result = await requestStructuredOutput({
      instructions:
        "Explain the concept behind this subject-and-topic question in simple, friendly language. Do not give unrelated facts. " +
        "Keep the explanation concise and do not ask a new question.",
      input: {
        subject: source.subject,
        topic: source.topic,
        question: currentQuestion.question,
        concept: currentQuestion.concept,
        answerKey: currentQuestion.answeredAt ? currentQuestion.answerKey : "",
      },
      schema: textSchema,
      maxOutputTokens: 350,
      userId: user._id,
    });
    if (!result || !nonEmpty(result.text)) {
      throw tutorError("The AI tutor could not create an explanation. Please try again.");
    }
    currentQuestion.explainAgain = result.text.slice(0, 1600);
    await saveSession(session);
  }
  return { session: serializeLearningSession(session), explanation: currentQuestion.explainAgain };
}

export async function nextTutorQuestion({ sessionId, user }) {
  await ensureActiveSession(sessionId, user._id);
  throw tutorError("Answer the current question before continuing.", 409);
}

export async function endTutorSession({ sessionId, user }) {
  const session = await ensureActiveSession(sessionId, user._id);
  session.status = "completed";
  session.completedAt = new Date();
  await saveSession(session);
  return { session: serializeLearningSession(session) };
}
