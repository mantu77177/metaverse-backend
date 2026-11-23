// File: backend/src/models/Quiz.js

import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    // ✅ Hindi — mandatory
    questionHindi: {
      type: String,
      required: [true, "Hindi question is required"],
      trim: true,
      maxlength: 1000,
    },

    // ✅ English — OPTIONAL
    questionEnglish: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    options: {
      type: [
        {
          // ✅ Hindi option — mandatory
          hindi: {
            type: String,
            required: [true, "Hindi option is required"],
            trim: true,
            maxlength: 500,
          },

          // ✅ English option — OPTIONAL
          english: {
            type: String,
            default: "",
            trim: true,
            maxlength: 500,
          },
        },
      ],
      validate: {
        validator: (arr) => arr.length === 4,
        message: "Exactly 4 options required",
      },
    },

    correctOption: { type: Number, required: true, min: 0, max: 3 },

    image: {
      url: { type: String, default: null },
      publicId: { type: String, default: null },
    },

    marks: { type: Number, default: 1, min: 1 },
    negativeMarks: { type: Number, default: 0, min: 0 },
  },
  { _id: true, timestamps: true }
);

const quizSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    description: { type: String, trim: true, maxlength: 2000 },

    // ✅ Banner (quiz ka)
    banner: {
      url: { type: String, default: null },
      publicId: { type: String, default: null },
    },

    // ✅ Category
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    categoryName: String,
    categorySlug: { type: String, lowercase: true, index: true },
    subCategory: { type: String, trim: true, default: "", index: true },

    // ✅ Settings
    durationMinutes: { type: Number, required: true, min: 1, max: 300 },
    totalQuestions: { type: Number, default: 0, min: 0 },
    totalMarks: { type: Number, default: 0 },

    // ✅ Pricing
    realPrice: { type: Number, default: 0, min: 0 },
    discountedPrice: { type: Number, default: 0, min: 0 },
    isFree: { type: Boolean, default: true },

    // ✅ Upload Date
    uploadDate: { type: Date, default: Date.now, index: true },

    // ✅ Questions
    questions: { type: [questionSchema], default: [] },

    // ✅ Status
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "published",
      index: true,
    },

    // ✅ Attempts
    maxAttempts: { type: Number, default: 1, min: 1, max: 100 },
    showAnswers: { type: Boolean, default: true },

    // ✅ Metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    createdByName: String,

    // ✅ Stats
    totalAttempts: { type: Number, default: 0 },
    totalPurchases: { type: Number, default: 0 },

    // ✅ NAYA: Soft Delete Fields (YE OBJECT KE ANDAR HONE CHAHIYE)
    isDeleted: { 
      type: Boolean, 
      default: false, 
      index: true 
    },
    deletedAt: { 
      type: Date, 
      default: null 
    },

  }, // ✅ Ye closing bracket sab fields ke baad aayega
  { timestamps: true }
);

// Indexes
quizSchema.index({ categorySlug: 1, subCategory: 1, status: 1 });
quizSchema.index({ title: "text", description: "text" });
quizSchema.index({ createdAt: -1 });
quizSchema.index({ updatedAt: -1, isDeleted: 1 });
quizSchema.index({ uploadDate: -1 });

// ✅ Auto-calculate totalMarks + isFree
quizSchema.pre("save", function (next) {
  // totalMarks auto-calculate
  this.totalMarks = (this.questions || []).reduce(
    (sum, q) => sum + (q.marks || 1),
    0
  );

  // isFree auto-set
  this.isFree = !this.discountedPrice || this.discountedPrice === 0;

  next();
});

export default mongoose.model("Quiz", quizSchema);