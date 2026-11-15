import mongoose from "mongoose";

const practiceQuestionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, maxlength: 1200 },
    concept: { type: String, required: true, maxlength: 160 },
    difficulty: { type: String, enum: ["easy", "medium", "hard", "advanced"], required: true },
    type: {
      type: String,
      enum: ["conceptual", "mcq", "true_false", "short_answer", "fill_blank", "code_output", "scenario"],
      required: true,
    },
    choices: [{ type: String, maxlength: 300 }],
    answerKey: { type: String, required: true, maxlength: 2000 },
    answerExplanation: { type: String, required: true, maxlength: 1200 },
    keyPoints: [{ type: String, maxlength: 300 }],
    optionsAvailableAt: { type: Date, required: true },
    answerDeadlineAt: { type: Date, required: true },
    studentAnswer: { type: String, maxlength: 300, default: "" },
    isCorrect: { type: Boolean, default: null },
    timedOut: { type: Boolean, default: false },
    timedOutAt: { type: Date, default: null },
    feedback: { type: String, maxlength: 1200, default: "" },
    explanation: { type: String, maxlength: 2000, default: "" },
    hint: { type: String, maxlength: 1000, default: "" },
    workedExample: { type: String, maxlength: 2000, default: "" },
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
    from: { type: String, enum: ["easy", "medium", "hard", "advanced"], required: true },
    to: { type: String, enum: ["easy", "medium", "hard", "advanced"], required: true },
    reason: { type: String, required: true, maxlength: 240 },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const practiceSessionSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    department: { type: String, required: true, maxlength: 120 },
    course: { type: String, trim: true, maxlength: 160, default: "" },
    semester: { type: Number, required: true, min: 1, max: 12 },
    subject: { type: String, required: true, maxlength: 160 },
    topic: { type: String, maxlength: 240, default: "" },
    answerTimeSeconds: { type: Number, min: 5, max: 120, default: 20 },
    status: { type: String, enum: ["active", "completed"], default: "active", index: true },
    currentDifficulty: { type: String, enum: ["easy", "medium", "hard", "advanced"], default: "easy" },
    highestDifficulty: { type: String, enum: ["easy", "medium", "hard", "advanced"], default: "easy" },
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
    questions: { type: [practiceQuestionSchema], default: [] },
    accuracy: { type: Number, min: 0, max: 100, default: 0 },
    durationSeconds: { type: Number, min: 0, default: 0 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

practiceSessionSchema.index({ student: 1, createdAt: -1 });
practiceSessionSchema.index({ student: 1, status: 1, updatedAt: -1 });

const PracticeSession =
  mongoose.models.PracticeSession || mongoose.model("PracticeSession", practiceSessionSchema);

export default PracticeSession;
