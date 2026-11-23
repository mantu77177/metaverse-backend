// File: backend/src/models/AuditLog.js

import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      index: true,
    },
    username: String,
    action: {
      type: String,
      required: true,
      enum: ["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT", "LOCKED", "TOKEN_REFRESH"],
      index: true,
    },
    ip: String,
    userAgent: String,
    message: String,
  },
  { timestamps: true }
);

// Auto-delete after 90 days (TTL index)
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model("AuditLog", auditLogSchema);