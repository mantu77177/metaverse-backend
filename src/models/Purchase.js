// File: backend/src/models/Purchase.js

import mongoose from "mongoose";

// ✅ PDF sub-schema (Cart/Wishlist ke saath consistent)
const pdfSchema = new mongoose.Schema(
  {
    url: { type: String, default: null },
    publicId: { type: String, default: null },
    name: { type: String, default: null },
    size: { type: Number, default: 0 },
    format: { type: String, default: null },
  },
  { _id: false }
);

const purchaseItemSchema = new mongoose.Schema(
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

    // ✅ PDFs (unlocked after purchase)
    questionPdf: { type: pdfSchema, default: null },
    answerPdf: { type: pdfSchema, default: null },

    // Pricing at time of purchase
    realPrice: { type: Number, default: 0, min: 0 },
    discountedPrice: { type: Number, default: 0, min: 0 },

    purchasedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Razorpay payment reference
    paymentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paymentMethod: { type: String, default: "razorpay" },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "completed",
      index: true,
    },

    // Total paid
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },

    // Purchased items snapshot
    items: {
      type: [purchaseItemSchema],
      default: [],
    },

    // Optional metadata
    notes: { type: String, default: "" },

    purchasedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// ✅ Compound index for fast user purchases lookup
purchaseSchema.index({ userId: 1, purchasedAt: -1 });

// ✅ Virtual for total items count
purchaseSchema.virtual("itemCount").get(function () {
  return this.items?.length || 0;
});

// ✅ Ensure virtuals in JSON
purchaseSchema.set("toJSON", { virtuals: true });
purchaseSchema.set("toObject", { virtuals: true });

export default mongoose.model("Purchase", purchaseSchema);