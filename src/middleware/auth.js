// File: backend/src/middleware/auth.js

import { verifyAccessToken, verifyUserAccessToken } from "../utils/token.js";
import Admin from "../models/Admin.js";
import User from "../models/User.js";

// =====================================================
//                 ADMIN AUTH
// =====================================================
export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyAccessToken(token);

    const admin = await Admin.findById(decoded.id);
    if (!admin || !admin.isActive) {
      return res.status(401).json({
        success: false,
        message: "Admin not found or inactive",
      });
    }

    req.admin = admin;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
        code: "TOKEN_EXPIRED",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

// =====================================================
//                 USER AUTH (NAYA)
// =====================================================
export const protectUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyUserAccessToken(token);

    // ✅ Check role = user
    if (decoded.role !== "user") {
      return res.status(403).json({
        success: false,
        message: "Access denied. User token required.",
      });
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
        code: "TOKEN_EXPIRED",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

// =====================================================
//                 ROLE CHECK (Admin only)
// =====================================================
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.admin?.role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }
    next();
  };
};

// =====================================================
//                 OPTIONAL USER (Guest allowed)
// =====================================================
// Agar token hai toh user attach karo, warna aage badho
export const optionalUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return next();   // Guest — allow
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyUserAccessToken(token);

    if (decoded.role === "user") {
      const user = await User.findById(decoded.id);
      if (user && user.isActive) {
        req.user = user;
      }
    }
    next();
  } catch {
    // Token invalid — still allow (guest)
    next();
  }
};