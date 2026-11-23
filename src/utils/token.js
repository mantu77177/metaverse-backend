// File: backend/src/utils/token.js

import jwt from "jsonwebtoken";

export const generateAccessToken = (admin) => {
  return jwt.sign(
    { id: admin._id, username: admin.username, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );
};

export const generateRefreshToken = (admin) => {
  return jwt.sign(
    { id: admin._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d" }
  );
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
};

// User-specific token verifiers (admin se alag secret)
export const verifyUserAccessToken = (token) => {
  return jwt.verify(
    token,
    process.env.USER_JWT_SECRET || process.env.JWT_SECRET
  );
};

export const verifyUserRefreshToken = (token) => {
  return jwt.verify(
    token,
    process.env.USER_REFRESH_TOKEN_SECRET || process.env.JWT_SECRET
  );
};