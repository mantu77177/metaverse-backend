// File: backend/src/middleware/rateLimiter.js

import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// =====================================================
//   HELPER — User-wise key generator
// =====================================================
const userKeyGenerator = (req, res) => {
  // ✅ User ID agar logged in hai
  if (req.user?._id) return `user:${req.user._id}`;
  // ✅ Admin ID agar admin hai
  if (req.admin?._id) return `admin:${req.admin._id}`;
  // ✅ Fallback — IP (IPv6 safe)
  return `ip:${ipKeyGenerator(req.ip)}`;
};

// =====================================================
//   1. LOGIN LIMITER — 5 attempts per 15 min
// =====================================================
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many login attempts. Try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// =====================================================
//   2. GENERAL API LIMITER — 100 requests per 15 min
// =====================================================
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Too many requests. Please slow down.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// =====================================================
//   3. STRICT LIMITER — 20 per 15 min (sensitive ops)
// =====================================================
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Rate limit exceeded. Try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// =====================================================
//   4. USER-WISE LIMITER — 200 req/min per user
// =====================================================
export const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  keyGenerator: userKeyGenerator,
  message: {
    success: false,
    message: "Too many requests. Please slow down.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// =====================================================
//   5. WRITE LIMITER — 30 writes per min per user
// =====================================================
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: userKeyGenerator,
  message: {
    success: false,
    message: "Too many write operations. Please wait.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// =====================================================
//   6. READ LIMITER — 300 reads per min per user
// =====================================================
export const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  keyGenerator: userKeyGenerator,
  message: {
    success: false,
    message: "Too many read requests. Please wait.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// =====================================================
//   7. AUTH LIMITER — 10 requests per 15 min per IP
// =====================================================
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: {
    success: false,
    message: "Too many auth attempts. Try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// =====================================================
//   8. DOWNLOAD LIMITER — 30 downloads per min per user
// =====================================================
export const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: userKeyGenerator,
  message: {
    success: false,
    message: "Too many downloads. Please wait a minute.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// =====================================================
//   9. ADMIN LIMITER — 500 req/min for admin
// =====================================================
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  keyGenerator: userKeyGenerator,
  message: {
    success: false,
    message: "Admin rate limit exceeded.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});