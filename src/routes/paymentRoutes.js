// File: backend/src/routes/paymentRoutes.js

import express from "express";
import {
  createOrder,
  verifyPayment,
} from "../controllers/paymentController.js";
import { protectUser } from "../middleware/auth.js";

const router = express.Router();

// ✅ POST /api/user/payment/create-order
router.post("/create-order", protectUser, createOrder);

// ✅ POST /api/user/payment/verify
router.post("/verify", protectUser, verifyPayment);

export default router;