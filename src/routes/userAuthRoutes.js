// File: backend/src/routes/userAuthRoutes.js

import express from "express";
import rateLimit from "express-rate-limit";
import {
  sendOtp,
  verifyOtp,
  refreshUser,     // ✅ refresh → refreshUser
  logoutUser,      // ✅ logout → logoutUser
  meUser,
} from "../controllers/authController.js";
import { protectUser } from "../middleware/auth.js";

const router = express.Router();

// OTP send rate limit — 5 per 15 min per IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many OTP requests. Try after 15 min.",
  },
});

// Verify rate limit — 10 per 15 min per IP
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many verification attempts.",
  },
});

router.post("/send-otp", otpLimiter, sendOtp);
router.post("/verify-otp", verifyLimiter, verifyOtp);
router.post("/refresh", refreshUser);              // ✅ refreshUser
router.post("/logout", protectUser, logoutUser);   // ✅ logoutUser
router.get("/me", protectUser, meUser);            // ✅ meUser

export default router;