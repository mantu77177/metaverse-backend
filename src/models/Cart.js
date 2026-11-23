// File: backend/src/models/Cart.js

import mongoose from "mongoose";

const pdfSchema = new mongoose.Schema(
  {
    url: { type: String, default: null },
    name: { type: String, default: null },
  },
  { _id: false }
);

const cartItemSchema = new mongoose.Schema(
  {
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    contentType: {
      type: String,
      enum: ["event", "assignment", "quiz"],
      required: true,
    },
    setId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    heading: { type: String, default: "" },
    title: { type: String, default: "" },
    banner: { type: String, default: "" },

    description: { type: String, default: "" },
    setDate: { type: Date, default: null },

    // ✅ NAYE FIELDS
    uploadDate: { type: Date, default: null },
    subCategory: { type: String, default: "" },
    durationMinutes: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 1 },

    questionPdf: { type: pdfSchema, default: null },
    answerPdf: { type: pdfSchema, default: null },

    realPrice: { type: Number, default: 0, min: 0 },
    discountedPrice: { type: Number, default: 0, min: 0 },

    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

cartSchema.index({ userId: 1, "items.setId": 1 });

cartSchema.virtual("itemCount").get(function () {
  return this.items?.length || 0;
});

cartSchema.set("toJSON", { virtuals: true });
cartSchema.set("toObject", { virtuals: true });

export default mongoose.model("Cart", cartSchema);