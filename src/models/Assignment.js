// File: backend/src/models/Assignment.js

import mongoose from "mongoose";

// ---------- Reusable File Schema ----------
const fileSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    size: Number,
    format: String,
    width: Number,
    height: Number,
  },
  { _id: false }
);

// ---------- Assignment Set Schema (nested) ----------
const assignmentSetSchema = new mongoose.Schema(
  {
    courseName: {
      type: String,
      required: [true, "Course name required"],
      trim: true,
      maxlength: 200,
    },
    heading: {
      type: String,
      required: [true, "Heading required"],
      trim: true,
      maxlength: 200,
    },
    subject: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    // ✅ Set ki category
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    categoryName: {
      type: String,
      index: true,
    },
    categorySlug: {
      type: String,
      lowercase: true,
      index: true,
    },

    // ✅ NAYA — Sub-category (free text)
    subCategory: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
      index: true,
    },

    questionPdf: {
      type: fileSchema,
      default: null,
    },
    answerPdf: {
      type: fileSchema,
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ---------- Main Assignment Schema ----------
const assignmentSchema = new mongoose.Schema(
  {
    universityName: {
      type: String,
      required: [true, "University name is required"],
      trim: true,
      maxlength: 200,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000,
    },

    // ✅ Assignment ki main category
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    categoryName: {
      type: String,
      index: true,
    },
    categorySlug: {
      type: String,
      lowercase: true,
      index: true,
    },

    // ✅ 3 banners (multiple images)
    banners: {
      type: [fileSchema],
      validate: {
        validator: (arr) => arr.length >= 1 && arr.length <= 3,
        message: "1-3 banners required",
      },
    },

    assignmentDate: {
      type: Date,
      required: [true, "Date is required"],
      index: true,
    },

    // ✅ Nested course sets
    sets: {
      type: [assignmentSetSchema],
      default: [],
    },

    // Metadata
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    createdByName: String,

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "published",
      index: true,
    },
    views: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// Text search index
assignmentSchema.index({
  universityName: "text",
  description: "text",
});

export default mongoose.model("Assignment", assignmentSchema);