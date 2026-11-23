// File: backend/src/middleware/uploadRateLimit.js

import rateLimit from "express-rate-limit";

// Upload ke liye strict rate limit
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute per IP
  message: {
    success: false,
    message: "Too many uploads. Slow down. Try again in a minute.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin bulk operations
export const adminUploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: "Too many admin uploads. Please wait.",
  },
});