import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

process.env.OCR_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.GEMINI_API_KEY = "ai-practice-test-key";
process.env.GEMINI_TUTOR_MODEL = "test-tutor-model";
import {
  geminiJsonResponse,
  mockGeminiUsage,
} from "../test/gemini-test-helpers.js";

const [
  { answerPracticeQuestion, endPracticeSession, getPracticeHistory, nextPracticeQuestion, nextPracticeDifficulty, serializePracticeSession, startPracticeSession, timeoutPracticeQuestion },
  { encryptJson },
  { default: Note },
  { default: NoteOcrResult },
  { default: PracticeSession },
  { default: SyllabusAnalysis },
] = await Promise.all([
  import("./ai-practice.service.js"),
  import("./encrypted-json.service.js"),
  import("../models/Note.js"),
  import("../models/NoteOcrResult.js"),
  import("../models/PracticeSession.js"),
  import("../models/SyllabusAnalysis.js"),
]);

test("a correct response increases difficulty by one level", () => {
  assert.equal(nextPracticeDifficulty({ difficulty: "easy", isCorrect: true }).difficulty, "medium");
  assert.equal(nextPracticeDifficulty({ difficulty: "medium", isCorrect: true }).difficulty, "hard");
  assert.equal(nextPracticeDifficulty({ difficulty: "hard", isCorrect: true }).difficulty, "advanced");
});

test("an incorrect response assigns a gentler follow-up difficulty", () => {
  assert.equal(nextPracticeDifficulty({ difficulty: "hard", isCorrect: false }).difficulty, "medium");
  assert.equal(nextPracticeDifficulty({ difficulty: "medium", isCorrect: false }).difficulty, "easy");
  assert.equal(nextPracticeDifficulty({ difficulty: "easy", isCorrect: false }).difficulty, "easy");
  assert.match(
    nextPracticeDifficulty({ difficulty: "medium", isCorrect: false, timedOut: true }).reason,
    /timed out/i,
  );
});

test("a correct response can regain the previous challenge after one mistake", () => {
  const afterMistake = nextPracticeDifficulty({ difficulty: "hard", isCorrect: false });
  const afterRecovery = nextPracticeDifficulty({ difficulty: afterMistake.difficulty, isCorrect: true });
  assert.equal(afterMistake.difficulty, "medium");
  assert.equal(afterRecovery.difficulty, "hard");
});

test("session serialization does not expose answer keys or grading points", () => {
  const session = {
    _id: "session-id",
    department: "CSE",
    course: "B.Tech",
    semester: 2,
    subject: "Python",
    answerTimeSeconds: 45,
    topic: "",
    status: "active",
    currentDifficulty: "easy",
    highestDifficulty: "easy",
    currentConcept: "variables",
    correctCount: 0,
    incorrectCount: 0,
    correctStreak: 0,
    incorrectStreak: 0,
    strongConcepts: [],
    weakConcepts: [],
    conceptMastery: [],
    difficultyChanges: [],
    questions: [{
      _id: "question-id",
      question: "What is a variable?",
      concept: "variables",
      difficulty: "easy",
      type: "mcq",
      choices: ["A named location that stores data.", "A loop", "A module", "A comment"],
      answerKey: "A named location that stores data.",
      answerExplanation: "It is a named location for a value.",
      keyPoints: ["stores data"],
      optionsAvailableAt: new Date(),
      answerDeadlineAt: new Date(Date.now() + 25_000),
      studentAnswer: "",
      isCorrect: null,
      timedOut: false,
      timedOutAt: null,
      feedback: "",
      explanation: "",
      hint: "",
      workedExample: "",
      explainAgain: "",
      answeredAt: null,
      skipped: false,
    }],
    accuracy: 0,
    durationSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
  };
  const serialized = serializePracticeSession(session);
  assert.equal(serialized.questions[0].question, "What is a variable?");
  assert.equal(serialized.answerTimeSeconds, 45);
  assert.equal("answerKey" in serialized.questions[0], false);
  assert.equal("keyPoints" in serialized.questions[0], false);
});

test("the Mongo practice-session schema accepts the persisted question and adaptive state", () => {
  const record = new PracticeSession({
    student: new PracticeSession.base.Types.ObjectId(),
    department: "CSE",
    course: "B.Tech",
    semester: 2,
    subject: "Python",
    answerTimeSeconds: 45,
    currentDifficulty: "medium",
    highestDifficulty: "medium",
    currentConcept: "variables",
    questions: [{
      question: "What does a Python variable store?",
      concept: "variables",
      difficulty: "medium",
      type: "mcq",
      choices: ["A named location that stores data.", "A loop", "A module", "A comment"],
      answerKey: "A named location that stores data.",
      answerExplanation: "It is a named location for a value.",
      keyPoints: ["stores data"],
      optionsAvailableAt: new Date(),
      answerDeadlineAt: new Date(Date.now() + 25_000),
    }],
    difficultyChanges: [{ from: "easy", to: "medium", reason: "Correct answer." }],
    strongConcepts: ["variables"],
  });
  assert.equal(record.validateSync(), undefined);
  assert.equal(record.answerTimeSeconds, 45);
});

test("AI Practice rejects answer timers outside the supported range", async () => {
  await assert.rejects(
    startPracticeSession({
      user: { _id: "507f1f77bcf86cd799439011", semester: 2 },
      selection: {
        department: "CSE",
        subject: "Python",
        answerTimeSeconds: 121,
      },
    }),
    { statusCode: 400 },
  );
});

test("AI Practice accepts a subject without matching notes and uses general subject knowledge", async (t) => {
  mockGeminiUsage(t);
  const studentId = "507f1f77bcf86cd799439011";
  const originalMethods = {
    noteFind: Note.find,
    syllabusFind: SyllabusAnalysis.find,
    create: PracticeSession.create,
    fetch: globalThis.fetch,
  };
  let noteQueries = 0;
  t.after(() => {
    Note.find = originalMethods.noteFind;
    SyllabusAnalysis.find = originalMethods.syllabusFind;
    PracticeSession.create = originalMethods.create;
    globalThis.fetch = originalMethods.fetch;
  });
  Note.find = (filter) => {
    noteQueries += 1;
    return {
      select() { return this; },
      sort() { return this; },
      limit() { return this; },
      async lean() {
        assert.equal(filter.department.source, "^Physics$");
        assert.equal(filter.subject.source, "^Astrophysics$");
        assert.equal(filter.$and, undefined);
        return [];
      },
    };
  };
  SyllabusAnalysis.find = () => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    async lean() { return []; },
  });
  let promptInput;
  globalThis.fetch = async (_url, request) => {
    const body = JSON.parse(request.body);
    promptInput = JSON.parse(body.contents[0].parts[0].text);
    const subject = promptInput.requestedSelection.subject;
    return geminiJsonResponse({
      question: `What does ${subject} study?`,
      concept: "foundational concepts",
      type: "mcq",
      choices: ["The subject's core ideas", "Only unrelated topics", "Nothing", "A file format"],
      answerKey: "The subject's core ideas",
      answerExplanation: `${subject} studies its core ideas.`,
      keyPoints: ["core ideas", "subject"],
    });
  };
  PracticeSession.create = async (input) => ({
    ...input,
    _id: "507f1f77bcf86cd799439013",
    questions: input.questions.map((question) => ({ ...question, _id: "question-1" })),
    status: "active",
    correctCount: 0,
    incorrectCount: 0,
    correctStreak: 0,
    incorrectStreak: 0,
    strongConcepts: [],
    weakConcepts: [],
    conceptMastery: [],
    difficultyChanges: [],
    accuracy: 0,
    durationSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const result = await startPracticeSession({
    user: { _id: studentId, semester: 2 },
    selection: {
      department: "Physics",
      subject: "Astrophysics",
    },
  });
  assert.equal(result.available, true);
  assert.equal(result.session.course, "");
  assert.equal(result.session.semester, 2);
  assert.match(result.session.questions[0].question, /Astrophysics/);
  assert.equal(promptInput.learningMaterial.startsWith("No uploaded notes"), true);
  assert.equal(promptInput.requestedSelection.subject, "Astrophysics");
  assert.equal(promptInput.requestedSelection.topic, "Choose from this subject's syllabus topics");
  assert.equal(noteQueries, 1);
});

test("the server rejects early, stale, and non-option answer requests", async (t) => {
  const studentId = "507f1f77bcf86cd799439021";
  const originalMethods = {
    findOne: PracticeSession.findOne,
    fetch: globalThis.fetch,
  };
  const question = {
    _id: "question-time-check",
    type: "mcq",
    question: "Pick the correct answer.",
    concept: "variables",
    difficulty: "easy",
    choices: ["right", "wrong one", "wrong two", "wrong three"],
    answerKey: "right",
    answerExplanation: "A simple explanation.",
    keyPoints: ["right"],
    optionsAvailableAt: new Date(Date.now() + 60_000),
    answerDeadlineAt: new Date(Date.now() + 85_000),
    studentAnswer: "",
    isCorrect: null,
    answeredAt: null,
    skipped: false,
  };
  const session = {
    _id: "session-time-check",
    student: studentId,
    status: "active",
    currentDifficulty: "easy",
    questions: [question],
  };
  t.after(() => {
    PracticeSession.findOne = originalMethods.findOne;
    globalThis.fetch = originalMethods.fetch;
  });
  PracticeSession.findOne = async () => session;
  globalThis.fetch = () => {
    throw new Error("MCQ answer scoring must not call the AI service.");
  };
  await assert.rejects(
    answerPracticeQuestion({
      sessionId: session._id,
      questionId: question._id,
      user: { _id: studentId },
      answer: "right",
    }),
    { statusCode: 409 },
  );
  question.optionsAvailableAt = new Date(Date.now() - 1);
  question.answerDeadlineAt = new Date(Date.now() + 60_000);
  await assert.rejects(
    answerPracticeQuestion({
      sessionId: session._id,
      questionId: "stale-question",
      user: { _id: studentId },
      answer: "right",
    }),
    { statusCode: 409 },
  );
  await assert.rejects(
    answerPracticeQuestion({
      sessionId: session._id,
      questionId: question._id,
      user: { _id: studentId },
      answer: "forged answer",
    }),
    { statusCode: 400 },
  );
  await assert.rejects(
    timeoutPracticeQuestion({
      sessionId: session._id,
      questionId: question._id,
      user: { _id: studentId },
    }),
    { statusCode: 409 },
  );
  assert.equal(question.isCorrect, null);
});

test("Python timed MCQ practice adapts after correct, incorrect, timeout, and recovery answers", async (t) => {
  mockGeminiUsage(t);
  const studentId = "507f1f77bcf86cd799439011";
  const noteId = "507f1f77bcf86cd799439012";
  const note = {
    _id: noteId,
    title: "Python variables",
    subject: "Python",
    topic: "Variables",
    unit: "Values",
    description: "Python variable basics",
    department: "CSE",
    semester: 2,
    uploadedBy: studentId,
  };
  const encryptedResult = encryptJson({
    pages: [{
      extractedText:
        "In Python, a variable is a named location that stores data. Variables can hold values. " +
        "A variable can be reassigned, replacing its previous value. For example, count = count + 1 adds one to the existing count.",
      recognizedFormulas: [],
      readabilityStatus: "readable",
    }],
  });
  const sessions = new Map();
  let createdSession;
  let questionNumber = 0;
  const questions = [
    "What is a variable used for in Python?",
    "Explain what happens when you reassign a Python variable.",
    "A Python variable named count stores 3, then stores 5. What does it hold now?",
    "Given count = 3 followed by count = count + 1, what value does count store?",
    "Why can reassigning a variable help update a running count?",
  ];
  const correctChoice = "A named location that stores data.";
  const wrongChoice = "A Python module.";
  function makeAnswerable(question) {
    question.optionsAvailableAt = new Date(Date.now() - 1);
    question.answerDeadlineAt = new Date(Date.now() + 60_000);
  }
  const originalMethods = {
    noteFind: Note.find,
    ocrFind: NoteOcrResult.find,
    syllabusFind: SyllabusAnalysis.find,
    create: PracticeSession.create,
    findOne: PracticeSession.findOne,
    find: PracticeSession.find,
    fetch: globalThis.fetch,
  };
  t.after(() => {
    Note.find = originalMethods.noteFind;
    NoteOcrResult.find = originalMethods.ocrFind;
    SyllabusAnalysis.find = originalMethods.syllabusFind;
    PracticeSession.create = originalMethods.create;
    PracticeSession.findOne = originalMethods.findOne;
    PracticeSession.find = originalMethods.find;
    globalThis.fetch = originalMethods.fetch;
  });

  Note.find = () => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    async lean() { return [note]; },
  });
  NoteOcrResult.find = () => ({
    select() { return this; },
    async lean() { return [{ note: noteId, encryptedResult }]; },
  });
  SyllabusAnalysis.find = () => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    async lean() { return []; },
  });
  PracticeSession.create = async (input) => {
    createdSession = {
      ...input,
      _id: "507f1f77bcf86cd799439013",
      questions: input.questions.map((question, index) => ({ ...question, _id: `question-${index + 1}` })),
      correctCount: 0,
      incorrectCount: 0,
      correctStreak: 0,
      incorrectStreak: 0,
      mcqCorrectStreak: 0,
      strongConcepts: [],
      weakConcepts: [],
      conceptMastery: [],
      difficultyChanges: [],
      accuracy: 0,
      durationSeconds: 0,
      createdAt: new Date(),
      markModified() {},
      async save() { sessions.set(this._id, this); },
    };
    sessions.set(createdSession._id, createdSession);
    return createdSession;
  };
  PracticeSession.findOne = async ({ _id }) => sessions.get(_id) ?? null;
  PracticeSession.find = () => ({
    sort() { return this; },
    limit() { return this; },
    async lean() { return [...sessions.values()]; },
  });
  globalThis.fetch = async (_url, request) => {
    const body = JSON.parse(request.body);
    const input = JSON.parse(body.contents[0].parts[0].text);
    const result = {
      question: questions[questionNumber],
      concept: "variables",
      type: "mcq",
      choices: [correctChoice, wrongChoice, "A Python comment.", "A repeated instruction."],
      answerKey: correctChoice,
      answerExplanation: "A variable is a named location that stores data.",
      keyPoints: ["named location", "stores data"],
    };
    assert.equal(input.difficulty, ["easy", "medium", "easy", "easy", "medium"][questionNumber]);
    if (questionNumber === 2 || questionNumber === 3) assert.equal(input.requestedConcept, "variables");
    questionNumber += 1;
    return geminiJsonResponse(result);
  };

  const user = { _id: studentId };
  let result = await startPracticeSession({
    user,
    selection: {
      department: "CSE",
      course: "B.Tech",
      semester: 2,
      subject: "Python",
      topic: "",
      answerTimeSeconds: 45,
    },
  });
  assert.equal(result.session.questions[0].difficulty, "easy");
  assert.equal(result.session.answerTimeSeconds, 45);
  assert.equal("answerKey" in result.session.questions[0], false);
  assert.equal(result.session.questions[0].choices.length, 4);
  assert.equal(
    new Date(result.session.questions[0].answerDeadlineAt).getTime() -
      new Date(result.session.questions[0].optionsAvailableAt).getTime(),
    45_000,
  );

  await assert.rejects(
    answerPracticeQuestion({
      sessionId: result.session.id,
      questionId: result.session.questions[0].id,
      user,
      answer: correctChoice,
    }),
    { statusCode: 409 },
  );

  makeAnswerable(createdSession.questions[0]);
  result = await answerPracticeQuestion({
    sessionId: result.session.id,
    questionId: result.session.questions[0].id,
    user,
    answer: correctChoice,
  });
  assert.equal(result.session.currentDifficulty, "medium");
  assert.equal(result.session.questions[0].isCorrect, true);
  assert.match(result.session.questions[0].explanation, /named location/i);

  result = await nextPracticeQuestion({
    sessionId: result.session.id,
    questionId: result.session.questions[0].id,
    user,
  });
  assert.equal(result.session.answerTimeSeconds, 45);
  assert.equal(
    new Date(result.session.questions[1].answerDeadlineAt).getTime() -
      new Date(result.session.questions[1].optionsAvailableAt).getTime(),
    45_000,
  );
  assert.equal(result.session.questions[1].difficulty, "medium");
  makeAnswerable(createdSession.questions[1]);
  result = await answerPracticeQuestion({
    sessionId: result.session.id,
    questionId: result.session.questions[1].id,
    user,
    answer: wrongChoice,
  });
  assert.equal(result.session.currentDifficulty, "easy");
  assert.equal(result.session.questions[1].isCorrect, false);
  assert.match(result.session.questions[1].explanation, /correct answer/i);

  result = await nextPracticeQuestion({
    sessionId: result.session.id,
    questionId: result.session.questions[1].id,
    user,
  });
  assert.equal(result.session.questions[2].difficulty, "easy");
  assert.equal(result.session.questions[2].concept, result.session.questions[1].concept);
  createdSession.questions[2].optionsAvailableAt = new Date(Date.now() - 25_001);
  createdSession.questions[2].answerDeadlineAt = new Date(Date.now() + 60_000);
  await assert.rejects(
    timeoutPracticeQuestion({
      sessionId: result.session.id,
      questionId: result.session.questions[2].id,
      user,
    }),
    { statusCode: 409 },
  );
  createdSession.questions[2].answerDeadlineAt = new Date(Date.now() - 1);
  result = await timeoutPracticeQuestion({
    sessionId: result.session.id,
    questionId: result.session.questions[2].id,
    user,
  });
  assert.equal(result.timedOut, true);
  assert.equal(result.session.questions[2].timedOut, true);
  assert.equal(result.session.questions[2].studentAnswer, "");
  assert.equal(result.session.questions[2].explanation, "");
  assert.equal(result.session.currentDifficulty, "easy");

  result = await nextPracticeQuestion({
    sessionId: result.session.id,
    questionId: result.session.questions[2].id,
    user,
  });
  assert.equal(result.session.questions[3].difficulty, "easy");
  assert.equal(result.session.questions[3].concept, result.session.questions[2].concept);
  makeAnswerable(createdSession.questions[3]);
  result = await answerPracticeQuestion({
    sessionId: result.session.id,
    questionId: result.session.questions[3].id,
    user,
    answer: correctChoice,
  });
  assert.equal(result.session.currentDifficulty, "medium");

  result = await nextPracticeQuestion({
    sessionId: result.session.id,
    questionId: result.session.questions[3].id,
    user,
  });
  assert.equal(result.session.questions[4].difficulty, "medium");
  makeAnswerable(createdSession.questions[4]);
  result = await answerPracticeQuestion({
    sessionId: result.session.id,
    questionId: result.session.questions[4].id,
    user,
    answer: correctChoice,
  });
  assert.equal(result.session.currentDifficulty, "hard");
  const ended = await endPracticeSession({ sessionId: result.session.id, user });
  assert.deepEqual(
    [ended.report.totalAttempted, ended.report.correctCount, ended.report.incorrectCount, ended.report.accuracy, ended.report.difficultyReached],
    [5, 3, 2, 60, "hard"],
  );
  assert.equal(sessions.get(result.session.id).status, "completed");
  const history = await getPracticeHistory({ user });
  assert.equal(history.sessions[0].attempted, 5);
  assert.equal(history.sessions[0].accuracy, 60);
});
