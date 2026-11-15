import assert from "node:assert/strict";
import test from "node:test";

process.env.GEMINI_API_KEY = "tutor-test-key";
process.env.GEMINI_TUTOR_MODEL = "test-tutor-model";
import { geminiJsonResponse, mockGeminiUsage } from "../test/gemini-test-helpers.js";
const [
  {
    nextDifficulty,
    serializeLearningSession,
    startTutorSession,
    answerTutorQuestion,
    endTutorSession,
    nextTutorQuestion,
  },
  { default: LearningSession },
  { default: Note },
] = await Promise.all([
  import("./learning-tutor.service.js"),
  import("../models/LearningSession.js"),
  import("../models/Note.js"),
]);

const student = { _id: "507f1f77bcf86cd799439011", role: "user" };
const noteId = "507f1f77bcf86cd799439012";

function makeQuestion(number) {
  const choices = [
    `Correct answer ${number}`,
    `Distractor ${number} A`,
    `Distractor ${number} B`,
    `Distractor ${number} C`,
  ];
  return {
    question: `Loops topic question ${number}?`,
    concept: "Loops",
    type: "mcq",
    choices,
    answerKey: choices[0],
    keyPoints: ["loops"],
  };
}

function mockQuizEnvironment(t, {
  subject = "Computer Science",
  department = "Computer Science",
  topic = "Loops",
  unit = "",
  title = "Programming",
  description = "Study resource",
  promptSubject = subject,
  promptTopic = topic,
} = {}) {
  mockGeminiUsage(t);
  const originals = {
    noteFindById: Note.findById,
    sessionFindOne: LearningSession.findOne,
    sessionCreate: LearningSession.create,
    fetch: globalThis.fetch,
  };
  let session = null;
  let generationRequests = 0;
  Note.findById = async () => ({
    _id: noteId,
    title,
    subject,
    department,
    topic,
    unit,
    description,
    publicationStatus: "published",
    visibility: "public",
    uploadedBy: { equals: () => false },
  });
  LearningSession.findOne = async () => session;
  LearningSession.create = async (data) => {
    session = new LearningSession(data);
    session.save = async () => session;
    return session;
  };
  globalThis.fetch = async (_url, options) => {
    generationRequests += 1;
    const request = JSON.parse(options.body);
    const prompt = JSON.parse(request.contents[0].parts[0].text);
    assert.equal(prompt.subject, promptSubject);
    assert.equal(prompt.topic, promptTopic);
    assert.match(prompt.task, /multiple-choice question strictly about the supplied topic/i);
    assert.equal("note" in prompt, false);
    return geminiJsonResponse(makeQuestion(prompt.previousQuestions.length + 1));
  };
  t.after(() => {
    Note.findById = originals.noteFindById;
    LearningSession.findOne = originals.sessionFindOne;
    LearningSession.create = originals.sessionCreate;
    globalThis.fetch = originals.fetch;
  });
  return {
    get session() { return session; },
    get generationRequests() { return generationRequests; },
  };
}

test("MCQ difficulty adapts after correct and incorrect answers", () => {
  assert.equal(nextDifficulty({
    difficulty: "easy",
    isCorrect: true,
    questionType: "mcq",
    mcqCorrectStreak: 1,
  }).difficulty, "easy");
  assert.equal(nextDifficulty({
    difficulty: "easy",
    isCorrect: true,
    questionType: "mcq",
    mcqCorrectStreak: 2,
  }).difficulty, "medium");
  assert.equal(nextDifficulty({
    difficulty: "hard",
    isCorrect: false,
    questionType: "mcq",
    mcqCorrectStreak: 0,
  }).difficulty, "medium");
});

test("the topic quiz has exactly ten MCQs and scores each selected answer", async (t) => {
  const mocked = mockQuizEnvironment(t);
  const started = await startTutorSession({ noteId, user: student });
  assert.equal(started.available, true);
  assert.equal(started.session.totalQuestions, 10);
  assert.equal(started.session.questions[0].type, "mcq");
  assert.equal(started.session.questions[0].choices.length, 4);

  let result;
  for (let index = 0; index < 10; index += 1) {
    const question = mocked.session.questions.at(-1);
    const chosenAnswer = index % 2 === 0 ? question.answerKey : question.choices[1];
    result = await answerTutorQuestion({
      sessionId: started.session.id,
      user: student,
      answer: chosenAnswer,
    });
    assert.equal(result.session.questionsAnswered, index + 1);
    assert.equal(result.session.correctCount, Math.ceil((index + 1) / 2));
    if (index < 9) {
      assert.equal(result.session.status, "active");
      assert.equal(result.session.questions.at(-1).type, "mcq");
    }
  }

  assert.equal(result.session.status, "completed");
  assert.equal(result.session.questions.length, 10);
  assert.equal(result.session.correctCount, 5);
  assert.equal(result.session.scorePercent, 50);
  assert.equal(mocked.generationRequests, 10);
  assert.equal("answerKey" in result.session.questions[0], false);
});

test("stopping partway through a quiz still saves and returns the current score", async (t) => {
  const mocked = mockQuizEnvironment(t);
  const started = await startTutorSession({ noteId, user: student });
  const firstQuestion = mocked.session.questions[0];
  await assert.rejects(
    answerTutorQuestion({
      sessionId: started.session.id,
      user: student,
      answer: "not one of the choices",
    }),
    { statusCode: 400 },
  );
  assert.equal(serializeLearningSession(mocked.session).questionsAnswered, 0);
  await answerTutorQuestion({
    sessionId: started.session.id,
    user: student,
    answer: firstQuestion.choices[1],
  });

  const result = await endTutorSession({
    sessionId: started.session.id,
    user: student,
  });
  assert.equal(result.session.status, "completed");
  assert.equal(result.session.totalQuestions, 10);
  assert.equal(result.session.questionsAnswered, 1);
  assert.equal(result.session.correctCount, 0);
  assert.equal(result.session.scorePercent, 0);
});

test("the quiz cannot skip an unanswered question", async (t) => {
  const mocked = mockQuizEnvironment(t);
  const started = await startTutorSession({ noteId, user: student });
  await assert.rejects(
    nextTutorQuestion({ sessionId: started.session.id, user: student }),
    { statusCode: 409 },
  );
  assert.equal(mocked.session.questions.length, 1);
});

test("the quiz is unavailable when no subject or topic can be derived from resource details", async (t) => {
  const mocked = mockQuizEnvironment(t, {
    subject: "",
    department: "",
    topic: "",
    unit: "",
    title: "",
    description: "",
  });
  const result = await startTutorSession({ noteId, user: student });
  assert.equal(result.available, false);
  assert.match(result.message, /identify a subject or topic from this resource's details/i);
  assert.equal(mocked.generationRequests, 0);
});

test("subject and topic are automatically derived from the open resource metadata", async (t) => {
  const mocked = mockQuizEnvironment(t, {
    subject: "",
    topic: "",
    department: "Computer Science",
    title: "Operating System Scheduling",
    promptSubject: "Computer Science",
    promptTopic: "Operating System Scheduling",
  });
  const result = await startTutorSession({ noteId, user: student });
  assert.equal(result.available, true);
  assert.equal(result.session.subject, "Computer Science");
  assert.equal(result.session.topic, "Operating System Scheduling");
  assert.equal(mocked.generationRequests, 1);
});

test("serialized quiz questions do not expose the answer key", () => {
  const session = new LearningSession({
    resourceTitle: "Programming",
    subject: "Computer Science",
    topic: "Loops",
    questions: [makeQuestion(1)],
  });
  const serialized = serializeLearningSession(session);
  assert.equal(serialized.questions[0].type, "mcq");
  assert.equal("answerKey" in serialized.questions[0], false);
  assert.equal(serialized.totalQuestions, 10);
});
