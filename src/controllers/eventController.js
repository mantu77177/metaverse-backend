// File: backend/src/controllers/eventController.js

import Event from "../models/Event.js";
import fs from "fs";
import path from "path";

// ➕ Create
export const createEvent = async (req, res) => {
  try {
    const {
      eventName,
      category,
      description,
      eventDate,
      eventEndDate,
      venue,
      organizer,
      question,
      answer,
      tags,
      difficulty,
      status,
    } = req.body;

    if (!eventName || !eventDate) {
      return res.status(400).json({
        success: false,
        message: "Event name and date required",
      });
    }

    const event = await Event.create({
      eventName,
      category: category || "other",
      description,
      eventDate,
      eventEndDate: eventEndDate || null,
      venue,
      organizer,
      question,
      answer,
      tags: tags
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      difficulty: difficulty || "medium",
      status: status || "published",
      banner: req.files?.banner?.[0]?.filename || null,
      photo: req.files?.photo?.[0]?.filename || null,
      pdf: req.files?.pdf?.[0]?.filename || null,
      createdBy: req.admin?._id,
    });

    res.status(201).json({ success: true, event });
  } catch (err) {
    console.error("Create event error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// 📋 List all
export const listEvents = async (req, res) => {
  try {
    const { category, status, search, limit = 100 } = req.query;
    const query = {};

    if (category) query.category = category;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { eventName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const events = await Event.find(query)
      .sort({ eventDate: -1 })
      .limit(Number(limit))
      .lean();

    res.json(events);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 🔍 Get one
export const getEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Not found" });

    event.views += 1;
    await event.save();

    res.json(event);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ✏️ Update
export const updateEvent = async (req, res) => {
  try {
    const updates = { ...req.body };

    if (updates.tags && typeof updates.tags === "string") {
      updates.tags = updates.tags.split(",").map((t) => t.trim()).filter(Boolean);
    }

    if (req.files?.banner) updates.banner = req.files.banner[0].filename;
    if (req.files?.photo) updates.photo = req.files.photo[0].filename;
    if (req.files?.pdf) updates.pdf = req.files.pdf[0].filename;

    const event = await Event.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!event) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 🗑️ Delete
export const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: "Not found" });

    ["banner", "photo", "pdf"].forEach((key) => {
      if (event[key]) {
        const p = path.join("uploads", event[key]);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    });

    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 📊 Stats
export const eventStats = async (req, res) => {
  try {
    const total = await Event.countDocuments();
    const byCategory = await Event.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);

    const upcoming = await Event.countDocuments({
      eventDate: { $gte: new Date() },
    });

    const past = await Event.countDocuments({
      eventDate: { $lt: new Date() },
    });

    res.json({ total, byCategory, upcoming, past });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};