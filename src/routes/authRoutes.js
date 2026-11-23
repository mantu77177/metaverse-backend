// File: backend/src/routes/authRoutes.js

import express from "express";
import { login, refresh, logout, me } from "../controllers/authController.js";
import { validateLogin } from "../middleware/validate.js";
import { loginLimiter } from "../middleware/rateLimiter.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/login", loginLimiter, validateLogin, login);
router.post("/refresh", refresh);
router.post("/logout", protect, logout);
router.get("/me", protect, me);

export default router;