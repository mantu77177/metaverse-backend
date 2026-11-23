// File: backend/src/models/Event.js

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

// ---------- Set Schema (Event ke andar nested) ----------
const setSchema = new mongoose.Schema(
  {
    heading: {
      type: String,
      required: [true, "Set heading required"],
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

    // ✅ Sub-category (free text)
    subCategory: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
      index: true,
    },

    // ✅ NAYA — Set ki date & time
    setDate: {
      type: Date,
      default: null,
      index: true,
    },

    realPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    discountedPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    sellPercentage: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    questionPdf: {
      type: fileSchema,
      default: null,
    },
    answerPdf: {
      type: fileSchema,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ---------- Main Event Schema ----------
const eventSchema = new mongoose.Schema(
  {
    eventName: {
      type: String,
      required: [true, "Event name is required"],
      trim: true,
      maxlength: 200,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000,
    },

    // ✅ Event ki main category
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

    eventDate: {
      type: Date,
      required: [true, "Event date is required"],
      index: true,
    },

    // ✅ Nested sets
    sets: {
      type: [setSchema],
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

eventSchema.index({ eventName: "text", description: "text" });

export default mongoose.model("Event", eventSchema);