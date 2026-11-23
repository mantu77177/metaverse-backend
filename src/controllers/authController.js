// File: backend/src/controllers/authController.js

import crypto from "crypto";
import UserSubscription from "../models/UserSubscription.js"; 
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";
import AuditLog from "../models/AuditLog.js";
import User from "../models/User.js";
import Otp from "../models/Otp.js";
import { sendOtpSms } from "../services/smsService.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  verifyUserRefreshToken,
} from "../utils/token.js";

// ---------- Helper ----------
const log = async (data) => {
  try {
    await AuditLog.create(data);
  } catch (e) {
    console.error("Audit log error:", e.message);
  }
};

// =====================================================
//                 ADMIN AUTH
// =====================================================

// 🔐 ADMIN LOGIN
export const login = async (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get("User-Agent") || "unknown";

  try {
    const admin = await Admin.findOne({ username }).select("+password");

    if (!admin) {
      await log({
        username,
        action: "LOGIN_FAILED",
        ip,
        userAgent,
        message: "Admin not found",
      });
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!admin.isActive) {
      await log({
        adminId: admin._id,
        username,
        action: "LOGIN_FAILED",
        ip,
        userAgent,
        message: "Account inactive",
      });
      return res.status(403).json({
        success: false,
        message: "Account is disabled. Contact superadmin.",
      });
    }

    if (admin.isLocked()) {
      const minutesLeft = Math.ceil((admin.lockUntil - Date.now()) / 60000);
      await log({
        adminId: admin._id,
        username,
        action: "LOCKED",
        ip,
        userAgent,
        message: `Account locked for ${minutesLeft} more minutes`,
      });
      return res.status(423).json({
        success: false,
        message: `Account locked. Try again in ${minutesLeft} minutes.`,
      });
    }

    const isMatch = await admin.comparePassword(password);

    if (!isMatch) {
      await admin.incLoginAttempts();
      await log({
        adminId: admin._id,
        username,
        action: "LOGIN_FAILED",
        ip,
        userAgent,
        message: `Wrong password (attempt ${admin.failedLoginAttempts + 1})`,
      });
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    await admin.resetLoginAttempts();

    const accessToken = generateAccessToken(admin);
    const refreshToken = generateRefreshToken(admin);

    admin.refreshToken = refreshToken;
    await admin.save({ validateBeforeSave: false });

    await log({
      adminId: admin._id,
      username,
      action: "LOGIN_SUCCESS",
      ip,
      userAgent,
      message: "Login successful",
    });

    res.json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        lastLogin: admin.lastLogin,
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// 🔄 ADMIN REFRESH
export const refresh = async (req, res) => {
  const { refreshToken } = req.body || {};

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: "Refresh token required",
    });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const admin = await Admin.findById(decoded.id).select("+refreshToken");

    if (!admin || admin.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    const newAccessToken = generateAccessToken(admin);
    const newRefreshToken = generateRefreshToken(admin);

    admin.refreshToken = newRefreshToken;
    await admin.save({ validateBeforeSave: false });

    res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token",
    });
  }
};

// 🚪 ADMIN LOGOUT
export const logout = async (req, res) => {
  try {
    if (req.admin) {
      await Admin.findByIdAndUpdate(req.admin._id, {
        $unset: { refreshToken: 1 },
      });

      await log({
        adminId: req.admin._id,
        username: req.admin.username,
        action: "LOGOUT",
        ip: req.ip,
      });
    }

    res.json({ success: true, message: "Logged out" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// 👤 ADMIN ME — sirf admin ke liye
export const me = async (req, res) => {
  if (!req.admin) {
    return res.status(401).json({
      success: false,
      message: "Admin auth required",
    });
  }
  res.json({
    success: true,
    admin: {
      id: req.admin._id,
      username: req.admin.username,
      email: req.admin.email,
      role: req.admin.role,
      lastLogin: req.admin.lastLogin,
    },
  });
};

// =====================================================
//                 USER AUTH (OTP BASED)
// =====================================================

// ---------- Helpers ----------
const generateOtp = () => {
  const length = Number(process.env.OTP_LENGTH) || 6;
  return crypto.randomInt(10 ** (length - 1), 10 ** length).toString();
};

const generateUserAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, phone: user.phone, role: "user" },
    process.env.USER_JWT_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );
};

const generateUserRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id, type: "refresh" },
    process.env.USER_REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
    { expiresIn: "90d" }
  );
};

// =====================================================
//                 SEND OTP
// =====================================================
export const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body || {};

    if (!phone || !/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit phone number",
      });
    }

    const ip = req.ip;
    const userAgent = req.get("User-Agent") || "unknown";

    // Cooldown check (60 sec)
    const recentOtp = await Otp.findOne({
      phone,
      createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
    });

    if (recentOtp) {
      const secondsLeft = Math.ceil(
        (60000 - (Date.now() - recentOtp.createdAt.getTime())) / 1000
      );
      return res.status(429).json({
        success: false,
        message: `Please wait ${secondsLeft}s before requesting new OTP`,
      });
    }

    // Delete old OTPs
    await Otp.deleteMany({ phone, verified: false });

    // Generate new
    const otp = generateOtp();
    const expiryMinutes = Number(process.env.OTP_EXPIRY_MINUTES) || 5;

    await Otp.create({
      phone,
      otp,
      ip,
      userAgent,
      expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
    });

    // Send SMS
    try {
      await sendOtpSms(phone, otp);
    } catch (smsErr) {
      console.error("SMS send failed:", smsErr.message);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP. Try again.",
      });
    }

    res.json({
      success: true,
      message: "OTP sent successfully",
      expiresIn: expiryMinutes * 60,
      ...(process.env.NODE_ENV === "development" && { devOtp: otp }),
    });
  } catch (err) {
    console.error("Send OTP error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// =====================================================
//                 VERIFY OTP + LOGIN
// =====================================================
export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp, name } = req.body || {};

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP required",
      });
    }

    const otpDoc = await Otp.findOne({ phone, verified: false }).sort({
      createdAt: -1,
    });

    if (!otpDoc) {
      return res.status(400).json({
        success: false,
        message: "OTP expired or not found. Please request a new one.",
      });
    }

    const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS) || 5;
    if (otpDoc.attempts >= maxAttempts) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return res.status(429).json({
        success: false,
        message: "Too many wrong attempts. Request new OTP.",
      });
    }

    if (otpDoc.expiresAt < new Date()) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return res.status(400).json({
        success: false,
        message: "OTP expired. Request a new one.",
      });
    }

    // Constant-time compare
    const isValid = crypto.timingSafeEqual(
      Buffer.from(otpDoc.otp),
      Buffer.from(otp.toString())
    );

    if (!isValid) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${maxAttempts - otpDoc.attempts} attempts left.`,
      });
    }

    otpDoc.verified = true;
    await otpDoc.save();

    // Find or create user
    let user = await User.findOne({ phone });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await User.create({
        phone,
        name: name || "",
        isVerified: true,
        source: "user-app",
      });
    }

    // Update metadata
    user.lastLogin = new Date();
    user.lastLoginIP = req.ip;
    user.loginCount = (user.loginCount || 0) + 1;

    // Generate tokens
    const accessToken = generateUserAccessToken(user);
    const refreshToken = generateUserRefreshToken(user);

    // Save refresh token (max 5 devices)
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push({
      token: refreshToken,
      device: req.get("User-Agent") || "unknown",
      ip: req.ip,
      createdAt: new Date(),
    });
    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }

    await user.save();

    // Cleanup OTP
    await Otp.deleteMany({ phone });

    res.json({
      success: true,
      message: isNewUser ? "Welcome! Account created" : "Login successful",
      isNewUser,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        photo: user.photo,
      },
    });
  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// =====================================================
//                 USER REFRESH TOKEN
// =====================================================
export const refreshUser = async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token required",
      });
    }

    // ✅ User refresh token verify (alag secret — Step 5)
    const decoded = verifyUserRefreshToken(refreshToken);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    // ✅ Token DB mein hai? (revoked nahi?)
    const entry = user.refreshTokens?.find((t) => t.token === refreshToken);
    if (!entry) {
      return res.status(401).json({ success: false, message: "Token revoked" });
    }

    // ✅ ROTATION: naya access + naya refresh
    const newAccessToken = generateUserAccessToken(user);
    const newRefreshToken = generateUserRefreshToken(user);

    // Purane entry ko naye token se replace karo (same device)
    entry.token = newRefreshToken;
    entry.createdAt = new Date();
    await user.save();

    res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,   // ← client ko naya refresh bhi bhejo
    });
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// =====================================================
//                 USER LOGOUT
// =====================================================
export const logoutUser = async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (req.user) {
      const user = await User.findById(req.user._id);
      if (user && refreshToken) {
        user.refreshTokens = user.refreshTokens.filter(
          (t) => t.token !== refreshToken
        );
        await user.save();
      }
    }
    res.json({ success: true, message: "Logged out" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// =====================================================
//                 USER ME — sirf user ke liye
// =====================================================
// export const meUser = async (req, res) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "User auth required",
//       });
//     }

//     const user = await User.findById(req.user._id).select("-refreshTokens");
//     if (!user) {
//       return res
//         .status(404)
//         .json({ success: false, message: "User not found" });
//     }
//     res.json({ success: true, user });
//   } catch (err) {
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// };

export const meUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "User auth required",
      });
    }

    const user = await User.findById(req.user._id).select("-refreshTokens").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // ✅ NAYA CODE: Active Prime Subscription Check
    const activeSub = await UserSubscription.findOne({
      userId: user._id,
      status: "active",
      endDate: { $gt: new Date() }
    }).lean();

    // User object mein isPrime add kar do
    const userWithPrime = {
      ...user,
      isPrime: !!activeSub,
      primeEndDate: activeSub ? activeSub.endDate : null,
    };

    res.json({ success: true, user: userWithPrime });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};