import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, maxlength: 1200 },
    concept: { type: String, required: true, maxlength: 160 },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard", "advanced"],
      required: true,
    },
    type: {
      type: String,
      enum: [
        "conceptual",
        "mcq",
        "true_false",
        "short_answer",
        "fill_blank",
        "code_output",
        "scenario",
      ],
      required: true,
    },
    choices: [{ type: String, maxlength: 300 }],
    answerKey: { type: String, required: true, maxlength: 2000 },
    keyPoints: [{ type: String, maxlength: 300 }],
    studentAnswer: { type: String, maxlength: 2000, default: "" },
    isCorrect: { type: Boolean, default: null },
    feedback: { type: String, maxlength: 1200, default: "" },
    explanation: { type: String, maxlength: 2000, default: "" },
    workedExample: { type: String, maxlength: 2000, default: "" },
    hintText: { type: String, maxlength: 800, default: "" },
    explainAgain: { type: String, maxlength: 1600, default: "" },
    answeredAt: { type: Date, default: null },
    skipped: { type: Boolean, default: false },
  },
  { timestamps: true, optimisticConcurrency: true },
);

const conceptMasterySchema = new mongoose.Schema(
  {
    concept: { type: String, required: true, maxlength: 160 },
    correct: { type: Number, min: 0, default: 0 },
    incorrect: { type: Number, min: 0, default: 0 },
    mastery: { type: Number, min: 0, max: 100, default: 0 },
  },
  { _id: false },
);

const difficultyChangeSchema = new mongoose.Schema(
  {
    from: {
      type: String,
      enum: ["easy", "medium", "hard", "advanced"],
      required: true,
    },
    to: {
      type: String,
      enum: ["easy", "medium", "hard", "advanced"],
      required: true,
    },
    reason: { type: String, required: true, maxlength: 240 },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const learningSessionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Note",
      required: true,
      index: true,
    },
    resourceType: { type: String, enum: ["note"], default: "note" },
    resourceTitle: { type: String, required: true, maxlength: 200 },
    subject: { type: String, required: true, maxlength: 160 },
    topic: { type: String, maxlength: 160, default: "" },
    status: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
      index: true,
    },
    totalQuestions: { type: Number, min: 10, max: 10, default: 10 },
    currentDifficulty: {
      type: String,
      enum: ["easy", "medium", "hard", "advanced"],
      default: "easy",
    },
    currentConcept: { type: String, maxlength: 160, default: "" },
    correctCount: { type: Number, min: 0, default: 0 },
    incorrectCount: { type: Number, min: 0, default: 0 },
    correctStreak: { type: Number, min: 0, default: 0 },
    incorrectStreak: { type: Number, min: 0, default: 0 },
    mcqCorrectStreak: { type: Number, min: 0, default: 0 },
    strongConcepts: [{ type: String, maxlength: 160 }],
    weakConcepts: [{ type: String, maxlength: 160 }],
    conceptMastery: { type: [conceptMasterySchema], default: [] },
    difficultyChanges: { type: [difficultyChangeSchema], default: [] },
    questions: { type: [questionSchema], default: [] },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

learningSessionSchema.index(
  { student: 1, resource: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
learningSessionSchema.index({ student: 1, resource: 1, updatedAt: -1 });

const LearningSession =
  mongoose.models.LearningSession || mongoose.model("LearningSession", learningSessionSchema);

export default LearningSession;
