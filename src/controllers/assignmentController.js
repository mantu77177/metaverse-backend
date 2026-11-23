// File: backend/src/controllers/assignmentController.js

import Assignment from "../models/Assignment.js";
import fs from "fs";
import path from "path";

// ➕ Create
export const createAssignment = async (req, res) => {
  try {
    const {
      universityName,
      assignmentTitle,
      category,
      subject,
      course,
      semester,
      description,
      deadline,
      question,
      answer,
      marks,
      difficulty,
      tags,
      status,
    } = req.body;

    if (!universityName || !assignmentTitle) {
      return res.status(400).json({
        success: false,
        message: "University name and assignment title required",
      });
    }

    const assignment = await Assignment.create({
      universityName,
      assignmentTitle,
      category: category || "other",
      subject,
      course,
      semester,
      description,
      deadline: deadline || null,
      question,
      answer,
      marks: marks || 0,
      difficulty: difficulty || "medium",
      tags: tags
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      status: status || "published",
      banner: req.files?.banner?.[0]?.filename || null,
      photo: req.files?.photo?.[0]?.filename || null,
      pdf: req.files?.pdf?.[0]?.filename || null,
      createdBy: req.admin?._id,
    });

    res.status(201).json({ success: true, assignment });
  } catch (err) {
    console.error("Create assignment error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// 📋 List
export const listAssignments = async (req, res) => {
  try {
    const { category, status, search, university, limit = 100 } = req.query;
    const query = {};

    if (category) query.category = category;
    if (status) query.status = status;
    if (university) query.universityName = university;
    if (search) {
      query.$or = [
        { assignmentTitle: { $regex: search, $options: "i" } },
        { universityName: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
      ];
    }

    const assignments = await Assignment.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    res.json(assignments);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 🔍 Get one
export const getAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment)
      return res.status(404).json({ success: false, message: "Not found" });

    assignment.downloads += 1;
    await assignment.save();

    res.json(assignment);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ✏️ Update
export const updateAssignment = async (req, res) => {
  try {
    const updates = { ...req.body };

    if (updates.tags && typeof updates.tags === "string") {
      updates.tags = updates.tags.split(",").map((t) => t.trim()).filter(Boolean);
    }

    if (req.files?.banner) updates.banner = req.files.banner[0].filename;
    if (req.files?.photo) updates.photo = req.files.photo[0].filename;
    if (req.files?.pdf) updates.pdf = req.files.pdf[0].filename;

    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if (!assignment)
      return res.status(404).json({ success: false, message: "Not found" });

    res.json({ success: true, assignment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 🗑️ Delete
export const deleteAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment)
      return res.status(404).json({ success: false, message: "Not found" });

    ["banner", "photo", "pdf"].forEach((key) => {
      if (assignment[key]) {
        const p = path.join("uploads", assignment[key]);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    });

    await Assignment.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// 📊 Stats
export const assignmentStats = async (req, res) => {
  try {
    const total = await Assignment.countDocuments();
    const byCategory = await Assignment.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);
    const byUniversity = await Assignment.aggregate([
      { $group: { _id: "$universityName", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const pending = await Assignment.countDocuments({
      deadline: { $gte: new Date() },
    });

    res.json({ total, byCategory, byUniversity, pending });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};