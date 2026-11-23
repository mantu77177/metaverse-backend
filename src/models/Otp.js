// File: backend/src/models/Otp.js

import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    otp: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    ip: String,
    userAgent: String,
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },   // ✅ TTL index — auto delete
    },
  },
  { timestamps: true }
);

export default mongoose.model("Otp", otpSchema);