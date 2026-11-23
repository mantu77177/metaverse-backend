// File: backend/src/models/Enquiry.js

import mongoose from "mongoose";

const enquirySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    complaint: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "resolved", "closed"],
      default: "pending",
      index: true,
    },
    // ✅ Admin response
    adminResponse: {
      type: String,
      default: "",
    },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    // ✅ Call tracking
    calledAt: {
      type: Date,
      default: null,
    },
    calledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

// ✅ Indexes for admin panel + user history
enquirySchema.index({ status: 1, createdAt: -1 });
enquirySchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Enquiry", enquirySchema);