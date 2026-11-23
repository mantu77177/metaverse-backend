// File: backend/src/routes/eventRoutes.js

import express from "express";
import {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  deleteEvent,
  eventStats,
} from "../controllers/eventController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/stats", protect, eventStats);
router.get("/", protect, listEvents);
router.get("/:id", protect, getEvent);
router.post("/", protect, createEvent);
router.put("/:id", protect, updateEvent);
router.delete("/:id", protect, deleteEvent);

export default router;