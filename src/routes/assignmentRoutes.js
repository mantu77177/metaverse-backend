// File: backend/src/routes/assignmentRoutes.js

import express from "express";
import {
  createAssignment,
  listAssignments,
  getAssignment,
  updateAssignment,
  deleteAssignment,
  assignmentStats,
} from "../controllers/assignmentController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/stats", protect, assignmentStats);
router.get("/", protect, listAssignments);
router.get("/:id", protect, getAssignment);
router.post("/", protect, createAssignment);
router.put("/:id", protect, updateAssignment);
router.delete("/:id", protect, deleteAssignment);

export default router;