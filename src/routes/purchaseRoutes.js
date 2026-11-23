// File: backend/src/routes/purchaseRoutes.js

import express from "express";
import {
  getMyPurchases,
  getAssetById,
  isPurchased,
} from "../controllers/purchaseController.js";
import { protectUser } from "../middleware/auth.js";

const router = express.Router();

// ✅ GET /api/user/purchases       — all my assets
router.get("/", protectUser, getMyPurchases);

// ✅ GET /api/user/purchases/check/:setId  — is this set purchased?
router.get("/check/:setId", protectUser, isPurchased);

// ✅ GET /api/user/purchases/:purchaseId/asset/:setId  — single asset details
router.get("/:purchaseId/asset/:setId", protectUser, getAssetById);

export default router;