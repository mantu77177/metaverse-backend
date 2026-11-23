// File: backend/src/models/QuizAttempt.js

import mongoose from "mongoose";

// ---------- Answer sub-schema ----------
const answerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    selectedOption: {
      type: Number,
      default: null, // null = not attempted
      min: 0,
      max: 3,
    },
    isCorrect: { type: Boolean, default: false },
    marksAwarded: { type: Number, default: 0 },
    timeSpent: { type: Number, default: 0 }, // seconds
  },
  { _id: false }
);

// ---------- Main attempt schema ----------
const quizAttemptSchema = new mongoose.Schema(
  {
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Attempt number
    attemptNumber: { type: Number, default: 1, min: 1 },

    // Answers
    answers: { type: [answerSchema], default: [] },

    // Score
    score: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
    unattemptedCount: { type: Number, default: 0 },

    // Percentage
    percentage: { type: Number, default: 0, min: 0, max: 100 },

    // Time tracking
    startedAt: { type: Date, default: Date.now, index: true },
    submittedAt: { type: Date, default: null },
    timeTaken: { type: Number, default: 0 }, // seconds

    // Status
    status: {
      type: String,
      enum: ["in-progress", "completed", "abandoned", "timeout"],
      default: "in-progress",
      index: true,
    },
  },
  { timestamps: true }
);

// Indexes
quizAttemptSchema.index({ quizId: 1, userId: 1, attemptNumber: 1 });
quizAttemptSchema.index({ quizId: 1, score: -1 }); // For leaderboard

export default mongoose.model("QuizAttempt", quizAttemptSchema);