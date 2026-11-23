// File: backend/src/models/User.js

import mongoose from "mongoose";

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

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      unique: true,
      trim: true,
      index: true,
      match: [/^[0-9]{10}$/, "Phone must be 10 digits"],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      sparse: true,
      index: true,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    // Cloudinary files
    pdf: { type: fileSchema, default: null },
    photo: { type: fileSchema, default: null },

    // Auth
    isVerified: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
    lastLoginIP: { type: String, default: null },
    loginCount: { type: Number, default: 0 },

    // Refresh tokens (multiple devices)
    refreshTokens: [
      {
        token: String,
        device: String,
        ip: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],

    source: { type: String, default: "user-app" },
  },
  { timestamps: true }
);

userSchema.index({ phone: "text", name: "text", email: "text" });

export default mongoose.model("User", userSchema);