// File: backend/server.js

import dotenv from "dotenv";
dotenv.config();
import express from "express";
import downloadRoutes from "./src/routes/downloadRoutes.js";
import { verifyAccessToken, verifyUserAccessToken } from "./src/utils/token.js";
import SubscriptionPlan from "./src/models/SubscriptionPlan.js";
import PromoCode from "./src/models/PromoCode.js";
import UserSubscription from "./src/models/UserSubscription.js";
import Quiz from "./src/models/Quiz.js";
import QuizAttempt from "./src/models/QuizAttempt.js";
import cors from "cors";
import crypto from "crypto";
import razorpay from "./src/config/razorpay.js";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import fs from "fs";
import path from "path";
import Cart from "./src/models/Cart.js";
import Wishlist from "./src/models/Wishlist.js";
import Purchase from "./src/models/Purchase.js";
import Enquiry from "./src/models/Enquiry.js";
import { getUserDetails } from "./src/controllers/adminUserController.js";

import paymentRoutes from "./src/routes/paymentRoutes.js";
import purchaseRoutes from "./src/routes/purchaseRoutes.js";

import { connectDB } from "./src/config/db.js";
import authRoutes from "./src/routes/authRoutes.js";
import userAuthRoutes from "./src/routes/userAuthRoutes.js";
import { protect, protectUser } from "./src/middleware/auth.js";
import { uploadLimiter } from "./src/middleware/uploadRateLimit.js";
import {
  userUpload,
  eventUpload,
  assignmentUpload,
  categoryUpload,
  quizUpload,
} from "./src/middleware/upload.js";

import {
  userLimiter,
  writeLimiter,
  readLimiter,
  authLimiter,
  adminLimiter,
} from "./src/middleware/rateLimiter.js";

import User from "./src/models/User.js";
import Admin from "./src/models/Admin.js";
import Event from "./src/models/Event.js";
import Assignment from "./src/models/Assignment.js";
import Category from "./src/models/Category.js";

import cloudinary from "./src/config/cloudinary.js";
import cache from "./src/utils/cache.js";

const app = express();

// app.set("trust proxy", 1);

app.set(
  "trust proxy",
  process.env.NODE_ENV === "production" ? 1 : false
)

// =====================================================
//                1. SECURITY MIDDLEWARE
// =====================================================
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,
  })
);
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// =====================================================
//                2. CORS
// =====================================================
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// =====================================================
//                3. BODY PARSERS
// =====================================================
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// =====================================================
//                4. STATIC FILES
// =====================================================
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
app.use("/uploads", express.static("uploads"));


const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// =====================================================
//                5. HELPER
// =====================================================
const buildFileObj = (file) => {
  if (!file) return null;

  let fileName = null;
  if (file.originalname?.trim()) fileName = file.originalname.trim();
  if (!fileName && file.name?.trim()) fileName = file.name.trim();
  if (!fileName) {
    const pid = file.filename || file.public_id || "";
    if (pid) {
      let last = pid.split("/").pop() || "";
      last = last.replace(/^\d+-/, "").replace(/\.pdf\.pdf$/, ".pdf");
      try { last = decodeURIComponent(last); } catch {}
      if (last) fileName = last;
    }
  }
  if (!fileName && file.format) fileName = `file.${file.format}`;

  const url = file.path || file.secure_url;

  // ✅ publicId — URL se bhi extract karo
  let publicId = file.filename || file.public_id || null;
  if (!publicId && url) {
    try {
      const parts = url.split("/upload/");
      if (parts.length > 1) {
        publicId = parts[1].replace(/^v\d+\//, "").replace(/\.pdf(\.pdf)?$/i, "");
      }
    } catch {}
  }

  return {
    url,
    publicId,
    name: fileName || null,
    size: file.size || 0,
    format: file.format || (fileName?.endsWith(".pdf") ? "pdf" : null),
    width: file.width,
    height: file.height,
  };
};

// =====================================================
//                6. HEALTH CHECK
// =====================================================
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "✅ Backend running (Cloudinary-enabled)",
    env: process.env.NODE_ENV,
    time: new Date().toISOString(),
  });
});

// =====================================================
//   6b. RATE LIMITERS — Routes se PEHLE
// =====================================================

// Lightweight token decoder — JWT se req.user/req.admin set karta hai
// (DB lookup nahi; protect/protectUser baad mein full document set karte hain)
const peekAuth = (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.split(" ")[1];
      let decoded = null;
      try {
        decoded = verifyAccessToken(token);        // admin (JWT_SECRET)
      } catch {
        try {
          decoded = verifyUserAccessToken(token);  // user (USER_JWT_SECRET)
        } catch {}
      }
      if (decoded) {
        if (decoded.role === "user") {
          req.user = { _id: decoded.id };
        } else if (decoded.role) {
          req.admin = { _id: decoded.id, role: decoded.role };
        }
      }
    }
  } catch {}
  next();
};

app.use("/api", peekAuth);

app.use("/api/admin", adminLimiter);
app.use("/api/user/auth", authLimiter);
app.use("/api/user", userLimiter);
app.use("/api/user", (req, res, next) => {
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  next();
});
app.use("/api/user", (req, res, next) => {
  if (req.method === "GET") return readLimiter(req, res, next);
  next();
});

// =====================================================
//                7. AUTH ROUTES + CACHE MIDDLEWARE
// =====================================================
app.use("/api/admin", authRoutes);
app.use("/api/user/auth", userAuthRoutes);
app.use("/api/user/payment", paymentRoutes);
app.use("/api/user/purchases", purchaseRoutes);
app.use("/api/user/assets", downloadRoutes);   // ✅ NAYA


// ✅ NAYA — Cache clear for admin writes
const clearCacheOnWrite = async (req, res, next) => {
  if (["POST", "PUT", "DELETE"].includes(req.method)) {
    await cache.flushAll();
  }
  next();
};
app.use("/api/admin", clearCacheOnWrite);

// =====================================================
//                8. USER: DASHBOARD STATS
// =====================================================
app.get("/api/user/dashboard/stats", protectUser, async (req, res) => {
  try {
    const [totalEvents, totalAssignments, totalCategories] = await Promise.all([
      Event.countDocuments({ status: "published" }),
      Assignment.countDocuments({ status: "published" }),
      Category.countDocuments({ isActive: true }),
    ]);
    res.json({
      success: true,
      stats: {
        totalEvents,
        totalAssignments,
        totalCategories,
        cartItems: 0,
        purchased: 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
//                9. USER: EVENTS (WITH CACHE)
// =====================================================
app.get("/api/user/events", protectUser, async (req, res) => {
  try {
    const { search, limit = 20, category, cursor } = req.query;
    const limitNum = Math.min(50, Math.max(1, Number(limit)));

    const cacheKey = `events:${search || ""}:${limitNum}:${category || ""}:${cursor || ""}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const filter = { status: "published" };
    if (search) filter.eventName = { $regex: search, $options: "i" };
    if (category) filter.categorySlug = category.toLowerCase();
    if (cursor) filter._id = { $lt: cursor };

    const events = await Event.find(filter)
      .sort({ _id: -1 })
      .limit(limitNum + 1)
      .lean();

    const hasMore = events.length > limitNum;
    const data = hasMore ? events.slice(0, limitNum) : events;
    const nextCursor = hasMore ? data[data.length - 1]._id : null;

    const response = {
      success: true,
      events: data,
      pagination: { hasMore, nextCursor, count: data.length },
    };
    await cache.set(cacheKey, response, 60);
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/user/events/:id", protectUser, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).lean();
    if (!event)
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
//                10. USER: ASSIGNMENTS (WITH CACHE)
// =====================================================
app.get("/api/user/assignments", protectUser, async (req, res) => {
  try {
    const { search, limit, category } = req.query;

    const cacheKey = `assignments:${search || ""}:${limit || ""}:${category || ""}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const filter = { status: "published" };

    if (search) {
      filter.universityName = { $regex: search, $options: "i" };
    }
    if (category) {
      filter.categorySlug = category.toLowerCase();
    }

    let query = Assignment.find(filter).sort({ assignmentDate: -1 });
    if (limit) query = query.limit(Number(limit));

    const assignments = await query.lean();

    const response = { success: true, assignments };
    await cache.set(cacheKey, response, 60);
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/user/assignments/:id", protectUser, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).lean();
    if (!assignment)
      return res
        .status(404)
        .json({ success: false, message: "Assignment not found" });
    res.json({ success: true, assignment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
//                11. USER: COURSES — CATEGORIES (WITH CACHE)
// =====================================================
app.get("/api/user/courses/categories", protectUser, async (req, res) => {
  try {
    const cacheKey = "categories:all";
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    // ✅ 3 parallel queries — N+1 nahi
    const [categories, eventCounts, assignmentCounts] = await Promise.all([
      Category.find({ isActive: true }).sort({ order: 1, name: 1 }).lean(),

      // ✅ Aggregation — ek query me saare event counts
      Event.aggregate([
        { $match: { status: "published" } },
        { $group: { _id: "$categorySlug", count: { $sum: 1 } } },
      ]),

      // ✅ Aggregation — ek query me saare assignment counts
      Assignment.aggregate([
        { $match: { status: "published" } },
        { $group: { _id: "$categorySlug", count: { $sum: 1 } } },
      ]),
    ]);

    // ✅ Map me convert karo — fast lookup
    const eventMap = eventCounts.reduce((acc, e) => {
      acc[e._id] = e.count;
      return acc;
    }, {});

    const assignmentMap = assignmentCounts.reduce((acc, a) => {
      acc[a._id] = a.count;
      return acc;
    }, {});

    // ✅ Har category me counts merge karo
    const categoriesWithCounts = categories.map((cat) => {
      const slug = cat.slug || cat.name.toLowerCase();
      const totalEvents = eventMap[slug] || 0;
      const totalAssignments = assignmentMap[slug] || 0;

      return {
        ...cat,
        slug,
        totalEvents,
        totalAssignments,
        totalContent: totalEvents + totalAssignments,
      };
    });

    const response = { success: true, categories: categoriesWithCounts };
    await cache.set(cacheKey, response, 300);
    res.json(response);
  } catch (err) {
    console.error("Categories fetch error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/user/courses/category/:slug", protectUser, async (req, res) => {
  try {
    const { slug } = req.params;
    const { type, sort } = req.query;
    const slugLower = slug.toLowerCase();

    const events = await Event.find({
      categorySlug: slugLower,
      status: "published",
    })
      .sort({ eventDate: -1 })
      .lean();

    const assignments = await Assignment.find({
      categorySlug: slugLower,
      status: "published",
    })
      .sort({ assignmentDate: -1 })
      .lean();

    let content = [];

    if (type === "events") {
      content = events.map((e) => ({ ...e, contentType: "event" }));
    } else if (type === "assignments") {
      content = assignments.map((a) => ({ ...a, contentType: "assignment" }));
    } else {
      content = [
        ...events.map((e) => ({ ...e, contentType: "event" })),
        ...assignments.map((a) => ({ ...a, contentType: "assignment" })),
      ];
    }

    if (sort === "price-low") {
      content.sort((a, b) => {
        const aP = a.sets?.[0]?.discountedPrice || 0;
        const bP = b.sets?.[0]?.discountedPrice || 0;
        return aP - bP;
      });
    } else if (sort === "price-high") {
      content.sort((a, b) => {
        const aP = a.sets?.[0]?.discountedPrice || 0;
        const bP = b.sets?.[0]?.discountedPrice || 0;
        return bP - aP;
      });
    }

    const category = await Category.findOne({
  name: new RegExp(`^${escapeRegex(slug)}$`, "i"),
    }).lean();

    res.json({
      success: true,
      category,
      content,
      total: content.length,
    });
  } catch (err) {
    console.error("Category content error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});// =====================================================
//                11b. USER: SUB-CATEGORIES
// =====================================================

// Get all sub-categories for a category
app.get(
  "/api/user/courses/category/:slug/subcategories",
  protectUser,
  async (req, res) => {
    try {
      const { slug } = req.params;
      const slugLower = slug.toLowerCase();

      const events = await Event.find({
        categorySlug: slugLower,
        status: "published",
      })
        .select("sets")
        .lean();

      const assignments = await Assignment.find({
        categorySlug: slugLower,
        status: "published",
      })
        .select("sets")
        .lean();

      const subCategoryMap = new Map();

      events.forEach((e) => {
        e.sets?.forEach((s) => {
          if (s.subCategory) {
            const key = s.subCategory;
            const existing = subCategoryMap.get(key) || {
              name: key,
              eventCount: 0,
              assignmentCount: 0,
              totalCount: 0,
            };
            existing.eventCount += 1;
            existing.totalCount += 1;
            subCategoryMap.set(key, existing);
          }
        });
      });

      assignments.forEach((a) => {
        a.sets?.forEach((s) => {
          if (s.subCategory) {
            const key = s.subCategory;
            const existing = subCategoryMap.get(key) || {
              name: key,
              eventCount: 0,
              assignmentCount: 0,
              totalCount: 0,
            };
            existing.assignmentCount += 1;
            existing.totalCount += 1;
            subCategoryMap.set(key, existing);
          }
        });
      });

      const subCategories = Array.from(subCategoryMap.values()).sort(
        (a, b) => b.totalCount - a.totalCount
      );

      const category = await Category.findOne({
  name: new RegExp(`^${escapeRegex(slug)}$`, "i"),
      }).lean();

      res.json({
        success: true,
        category,
        subCategories,
        total: subCategories.length,
      });
    } catch (err) {
      console.error("Sub-categories fetch error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Get content for a specific sub-category
app.get(
  "/api/user/courses/category/:slug/subcategory/:subCategory",
  protectUser,
  async (req, res) => {
    try {
      const { slug, subCategory } = req.params;
      const slugLower = slug.toLowerCase();
      const subLower = subCategory.toLowerCase();

      const events = await Event.find({
        categorySlug: slugLower,
        status: "published",
"sets.subCategory": {
  $regex: new RegExp(`^${escapeRegex(subLower)}$`, "i"),
},      }).lean();

      const assignments = await Assignment.find({
        categorySlug: slugLower,
        status: "published",
"sets.subCategory": {
  $regex: new RegExp(`^${escapeRegex(subLower)}$`, "i"),
},      }).lean();

      const filteredEvents = events.map((e) => ({
        ...e,
        sets: (e.sets || []).filter(
          (s) => s.subCategory?.toLowerCase() === subLower
        ),
        contentType: "event",
      }));

      const filteredAssignments = assignments.map((a) => ({
        ...a,
        sets: (a.sets || []).filter(
          (s) => s.subCategory?.toLowerCase() === subLower
        ),
        contentType: "assignment",
      }));

      const content = [...filteredEvents, ...filteredAssignments];

      res.json({
        success: true,
        subCategory,
        content,
        total: content.length,
      });
    } catch (err) {
      console.error("Sub-category content error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// =====================================================
//                11c. USER: CART
// =====================================================

app.get("/api/user/cart", protectUser, async (req, res) => {
  try {
    let cart = await Cart.findOne({ userId: req.user._id }).lean();
    if (!cart) {
      cart = { userId: req.user._id, items: [] };
    }
    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/user/cart/add", protectUser, async (req, res) => {
  try {
    const {
      contentId, contentType, setId,
      heading, title, banner, realPrice, discountedPrice,
      description, setDate, uploadDate,
      subCategory, durationMinutes, totalQuestions, totalMarks, maxAttempts,
      questionPdf, answerPdf,
    } = req.body;

    if (!contentId || !contentType || !setId) {
      return res.status(400).json({
        success: false,
        message: "contentId, contentType, setId required",
      });
    }

    let cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) {
      cart = new Cart({ userId: req.user._id, items: [] });
    }

    const exists = cart.items.find(
      (i) =>
        i.contentId.toString() === contentId.toString() &&
        i.setId.toString() === setId.toString()
    );

    if (!exists) {
      cart.items.push({
        contentId,
        contentType,
        setId,
        heading: heading || "",
        title: title || "",
        banner: banner || "",
        realPrice: realPrice || 0,
        discountedPrice: discountedPrice || 0,
        description: description || "",
        setDate: setDate ? new Date(setDate) : null,
        // ✅ NAYE FIELDS
        uploadDate: uploadDate ? new Date(uploadDate) : null,
        subCategory: subCategory || "",
        durationMinutes: durationMinutes || 0,
        totalQuestions: totalQuestions || 0,
        totalMarks: totalMarks || 0,
        maxAttempts: maxAttempts || 1,
        questionPdf: questionPdf || null,
        answerPdf: answerPdf || null,
      });
      await cart.save();
    }

    res.json({
      success: true,
      cart,
      message: exists ? "Already in cart" : "Added to cart",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/user/cart/remove/:setId", protectUser, async (req, res) => {
  try {
    const { setId } = req.params;
    const cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) {
      return res.json({ success: true, cart: { items: [] } });
    }

    cart.items = cart.items.filter(
      (i) => i.setId.toString() !== setId.toString()
    );
    await cart.save();

    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/user/cart/clear", protectUser, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id });
    if (cart) {
      cart.items = [];
      await cart.save();
    }
    res.json({ success: true, cart: { items: [] } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// =====================================================
//                11e. USER: ENQUIRY (CREATE)
// =====================================================
app.post("/api/user/enquiry", protectUser, async (req, res) => {
  try {
    const { phone, email, complaint } = req.body;

    // Validation
    if (!phone || !/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Valid 10-digit phone required",
      });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Valid email required",
      });
    }

    if (!complaint || complaint.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "Complaint must be at least 10 characters",
      });
    }

    // ✅ RATE LIMIT CHECK — 10 min me sirf 1 enquiry
    const RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
    const lastEnquiry = await Enquiry.findOne({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    if (lastEnquiry) {
      const timeSinceLast = Date.now() - new Date(lastEnquiry.createdAt).getTime();

      if (timeSinceLast < RATE_LIMIT_MS) {
        const minutesLeft = Math.ceil(
          (RATE_LIMIT_MS - timeSinceLast) / 60000
        );
        return res.status(429).json({
          success: false,
          message: `You can submit another enquiry after ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}. Please wait.`,
          retryAfter: RATE_LIMIT_MS - timeSinceLast,
          lastEnquiryAt: lastEnquiry.createdAt,
        });
      }
    }

    // Create enquiry
    const enquiry = await Enquiry.create({
      userId: req.user._id,
      phone,
      email,
      complaint: complaint.trim(),
      status: "pending",
    });

    res.json({
      success: true,
      message: "Enquiry submitted successfully",
      enquiry: {
        id: enquiry._id,
        status: enquiry.status,
        createdAt: enquiry.createdAt,
      },
    });
  } catch (err) {
    console.error("Enquiry create error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
//                11f. USER: ENQUIRY (LIST OWN)
// =====================================================
app.get("/api/user/enquiries", protectUser, async (req, res) => {
  try {
    const enquiries = await Enquiry.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, enquiries });
  } catch (err) {
    console.error("Enquiry list error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
//                11g. USER: ENQUIRY — LAST SUBMITTED
// =====================================================
app.get("/api/user/enquiries/last", protectUser, async (req, res) => {
  try {
    const lastEnquiry = await Enquiry.findOne({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .select("createdAt status complaint")
      .lean();

    if (!lastEnquiry) {
      return res.json({
        success: true,
        canSubmit: true,
        lastEnquiryAt: null,
      });
    }

    const RATE_LIMIT_MS = 10 * 60 * 1000;
    const timeSinceLast = Date.now() - new Date(lastEnquiry.createdAt).getTime();
    const canSubmit = timeSinceLast >= RATE_LIMIT_MS;
    const retryAfterMs = canSubmit ? 0 : RATE_LIMIT_MS - timeSinceLast;

    res.json({
      success: true,
      canSubmit,
      lastEnquiryAt: lastEnquiry.createdAt,
      retryAfterMs,
      minutesLeft: canSubmit ? 0 : Math.ceil(retryAfterMs / 60000),
    });
  } catch (err) {
    console.error("Last enquiry error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
//                11d. USER: WISHLIST
// =====================================================

app.get("/api/user/wishlist", protectUser, async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({
      userId: req.user._id,
    }).lean();
    if (!wishlist) {
      wishlist = { userId: req.user._id, items: [] };
    }
    res.json({ success: true, wishlist });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/user/wishlist/toggle", protectUser, async (req, res) => {
  try {
    const {
      contentId, contentType, setId,
      heading, title, banner, realPrice, discountedPrice,
      description, setDate, uploadDate,
      subCategory, durationMinutes, totalQuestions, totalMarks, maxAttempts,
      questionPdf, answerPdf,
    } = req.body;

    if (!contentId || !contentType || !setId) {
      return res.status(400).json({
        success: false,
        message: "contentId, contentType, setId required",
      });
    }

    let wishlist = await Wishlist.findOne({ userId: req.user._id });
    if (!wishlist) {
      wishlist = new Wishlist({ userId: req.user._id, items: [] });
    }

    const existingIndex = wishlist.items.findIndex(
      (i) =>
        i.contentId.toString() === contentId.toString() &&
        i.setId.toString() === setId.toString()
    );

    let action = "added";
    if (existingIndex >= 0) {
      wishlist.items.splice(existingIndex, 1);
      action = "removed";
    } else {
      wishlist.items.push({
        contentId,
        contentType,
        setId,
        heading: heading || "",
        title: title || "",
        banner: banner || "",
        realPrice: realPrice || 0,
        discountedPrice: discountedPrice || 0,
        description: description || "",
        setDate: setDate ? new Date(setDate) : null,
        // ✅ NAYE FIELDS
        uploadDate: uploadDate ? new Date(uploadDate) : null,
        subCategory: subCategory || "",
        durationMinutes: durationMinutes || 0,
        totalQuestions: totalQuestions || 0,
        totalMarks: totalMarks || 0,
        maxAttempts: maxAttempts || 1,
        questionPdf: questionPdf || null,
        answerPdf: answerPdf || null,
      });
    }

    await wishlist.save();

    res.json({
      success: true,
      wishlist,
      action,
      message:
        action === "added" ? "Added to wishlist" : "Removed from wishlist",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete(
  "/api/user/wishlist/remove/:setId",
  protectUser,
  async (req, res) => {
    try {
      const { setId } = req.params;
      const wishlist = await Wishlist.findOne({ userId: req.user._id });
      if (!wishlist) {
        return res.json({ success: true, wishlist: { items: [] } });
      }

      wishlist.items = wishlist.items.filter(
        (i) => i.setId.toString() !== setId.toString()
      );
      await wishlist.save();

      res.json({ success: true, wishlist });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// =====================================================
//                12. USER: PROFILE UPDATE
// =====================================================
app.put(
  "/api/user/profile",
  protectUser,
  userUpload.fields([{ name: "avatar", maxCount: 1 }]),
  async (req, res) => {
    try {
      const { name, email, address, removeAvatar } = req.body || {};
      const update = {};

      if (name !== undefined) update.name = name;
      if (email !== undefined) update.email = email;
      if (address !== undefined) update.address = address;

      if (req.files?.avatar?.[0]) {
        const currentUser = await User.findById(req.user._id);
        if (currentUser?.photo?.publicId) {
          try {
            await cloudinary.uploader.destroy(currentUser.photo.publicId, {
              resource_type: "image",
            });
          } catch (e) {
            console.error("Old avatar delete fail:", e.message);
          }
        }
        update.photo = buildFileObj(req.files.avatar[0]);
      } else if (removeAvatar === "true") {
        const currentUser = await User.findById(req.user._id);
        if (currentUser?.photo?.publicId) {
          try {
            await cloudinary.uploader.destroy(currentUser.photo.publicId, {
              resource_type: "image",
            });
          } catch (e) {
            console.error("Avatar delete fail:", e.message);
          }
        }
        update.photo = null;
      }

      const user = await User.findByIdAndUpdate(req.user._id, update, {
        new: true,
      }).select("-refreshTokens");

      res.json({ success: true, user });
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// =====================================================
//                13. USER UPLOAD (legacy)
// =====================================================
app.post(
  "/api/upload",
  uploadLimiter,
  userUpload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { name, email, phone, address } = req.body;

      if (!name || !email || !phone) {
        return res
          .status(400)
          .json({ success: false, message: "Name, email, phone required" });
      }

      const user = await User.create({
        name,
        email,
        phone,
        address,
        pdf: buildFileObj(req.files?.pdf?.[0]),
        photo: buildFileObj(req.files?.photo?.[0]),
      });

      res.json({ success: true, user });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// =====================================================
//                14. ADMIN: USERS
// =====================================================
app.get("/api/admin/users", protect, async (req, res) => {
  try {
    const { limit = 20, cursor, search } = req.query;
    const limitNum = Math.min(100, Math.max(1, Number(limit)));

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    if (cursor) filter._id = { $lt: cursor };

    const users = await User.find(filter)
      .sort({ _id: -1 })
      .limit(limitNum + 1)
      .lean();

    const hasMore = users.length > limitNum;
    const data = hasMore ? users.slice(0, limitNum) : users;
    const nextCursor = hasMore ? data[data.length - 1]._id : null;

    res.json({
      success: true,
      users: data,
      data: data,
      pagination: { hasMore, nextCursor, count: data.length },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/admin/users/:id/details", protect, getUserDetails);

app.delete("/api/admin/users/:id", protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user)
      return res.status(404).json({ success: false, message: "Not found" });

    const publicIds = [];
    if (user.pdf?.publicId)
      publicIds.push({ id: user.pdf.publicId, type: "image" });
    if (user.photo?.publicId)
      publicIds.push({ id: user.photo.publicId, type: "image" });

    for (const { id, type } of publicIds) {
      try {
        await cloudinary.uploader.destroy(id, { resource_type: type });
      } catch (e) {
        console.error("Cloudinary delete fail:", e.message);
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// =====================================================
//                15a. ADMIN: QUIZ MANAGEMENT
// =====================================================

// ---------- Create Quiz ----------
app.post(
  "/api/admin/quizzes",
  uploadLimiter,
  protect,
  quizUpload.single("banner"),
  async (req, res) => {
  const startTime = Date.now();
  console.log("\n🔵 ===== QUIZ CREATE STARTED =====");
  console.log("⏱️ Time:", new Date().toISOString());
  
  try {
    console.log("📦 Body keys:", Object.keys(req.body));
    console.log("🖼️ File:", req.file ? `${req.file.originalname} (${req.file.size} bytes)` : "No file");
    
    const {
      title, description, category, subCategory,
      durationMinutes, questions, totalQuestions,
      uploadDate, status, maxAttempts, showAnswers,
      realPrice, discountedPrice,
    } = req.body;

    // Parse questions
    let parsedQuestions = questions;
    if (typeof questions === "string") {
      try {
        parsedQuestions = JSON.parse(questions);
        console.log("✅ Questions parsed:", parsedQuestions.length);
      } catch (e) {
        console.log("❌ JSON parse error:", e.message);
        return res.status(400).json({
          success: false,
          message: "Invalid questions format",
        });
      }
    }

    // Validation
    if (!title) {
      console.log("❌ Title missing");
      return res.status(400).json({ success: false, message: "Title required" });
    }
    if (!category) {
      console.log("❌ Category missing");
      return res.status(400).json({ success: false, message: "Category required" });
    }
    if (!durationMinutes || durationMinutes < 1) {
      console.log("❌ Invalid duration");
      return res.status(400).json({ success: false, message: "Valid duration required" });
    }
    if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
      console.log("❌ No questions");
      return res.status(400).json({
        success: false,
        message: "At least 1 question required",
      });
    }

    // Validate each question — Sirf Hindi mandatory
    for (let i = 0; i < parsedQuestions.length; i++) {
      const q = parsedQuestions[i];
      if (!q.questionHindi?.trim()) {
        console.log(`❌ Q${i + 1}: Hindi question missing`);
        return res.status(400).json({
          success: false,
          message: `Q${i + 1}: Hindi question text required`,
        });
      }
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        console.log(`❌ Q${i + 1}: Options not 4`);
        return res.status(400).json({
          success: false,
          message: `Q${i + 1}: Exactly 4 options required`,
        });
      }
      for (let j = 0; j < 4; j++) {
        if (!q.options[j].hindi?.trim()) {
          console.log(`❌ Q${i + 1}, Option ${j + 1}: Hindi option missing`);
          return res.status(400).json({
            success: false,
            message: `Q${i + 1}, Option ${j + 1}: Hindi option required`,
          });
        }
      }
      if (q.correctOption === undefined || q.correctOption < 0 || q.correctOption > 3) {
        console.log(`❌ Q${i + 1}: Correct option invalid`);
        return res.status(400).json({
          success: false,
          message: `Q${i + 1}: Correct option must be 0-3`,
        });
      }
    }
    console.log("✅ All questions validated");

    // Get category
    console.log("🔍 Finding category ID:", category);
    const cat = await Category.findById(category);
    if (!cat) {
      console.log("❌ Category not found in DB");
      return res.status(400).json({ success: false, message: "Invalid category" });
    }
    console.log("✅ Category found:", cat.name, "| Time:", Date.now() - startTime, "ms");

    // Create quiz
    console.log("💾 Creating quiz in DB...");
    const quiz = await Quiz.create({
      title: title.trim(),
      description: description || "",
      banner: req.file ? buildFileObj(req.file) : null,
      category: cat._id,
      categoryName: cat.name,
      categorySlug: cat.slug || cat.name.toLowerCase(),
      subCategory: subCategory ? subCategory.trim() : "",
      durationMinutes: Number(durationMinutes),
      totalQuestions: Number(totalQuestions) || parsedQuestions.length,
      questions: parsedQuestions,
      uploadDate: uploadDate ? new Date(uploadDate) : new Date(),
      status: status || "published",
      maxAttempts: Number(maxAttempts) || 1,
      showAnswers: showAnswers !== false,
      realPrice: Number(realPrice) || 0,
      discountedPrice: Number(discountedPrice) || 0,
      createdBy: req.admin._id,
      createdByName: req.admin.username,
    });
    console.log("✅ Quiz created:", quiz._id);
    console.log("⏱️ Total time:", Date.now() - startTime, "ms");
    console.log("🔵 ===== QUIZ CREATE DONE =====\n");

    res.json({ success: true, quiz });
  } catch (err) {
    console.error("\n❌ ===== QUIZ CREATE ERROR =====");
    console.error("Message:", err.message);
    console.error("Name:", err.name);
    console.error("Stack:", err.stack);
    console.error("⏱️ Failed after:", Date.now() - startTime, "ms");
    console.error("❌ ===== END ERROR =====\n");
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- List Quizzes ----------
app.get("/api/admin/quizzes", protect, async (req, res) => {
  try {
    const { category, subCategory, status, search } = req.query;
    const filter = {};

    if (category) filter.categorySlug = category.toLowerCase();
    if (subCategory) filter.subCategory = subCategory;
    if (status) filter.status = status;
    if (search) filter.title = { $regex: search, $options: "i" };

    const quizzes = await Quiz.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.json(quizzes);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Get Single Quiz (admin) ----------
app.get("/api/admin/quizzes/:id", protect, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id).lean();
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });
    res.json(quiz);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Update Quiz ----------
app.put(
  "/api/admin/quizzes/:id",
  uploadLimiter,
  protect,
  quizUpload.single("banner"),
  async (req, res) => {
  try {
    const {
      title, description, category, subCategory,
      durationMinutes, questions, status, maxAttempts,
      showAnswers, realPrice, discountedPrice,
      uploadDate, totalQuestions,        // ✅ NAYA
    } = req.body;

    const update = {};
    if (title) update.title = title;
    if (description !== undefined) update.description = description;
if (subCategory !== undefined) update.subCategory = subCategory.trim();    
    if (durationMinutes) update.durationMinutes = Number(durationMinutes);
    if (status) update.status = status;
    if (maxAttempts) update.maxAttempts = Number(maxAttempts);
    if (showAnswers !== undefined) update.showAnswers = showAnswers;
        if (realPrice !== undefined) update.realPrice = Number(realPrice);
    if (discountedPrice !== undefined) update.discountedPrice = Number(discountedPrice);
    if (totalQuestions !== undefined) update.totalQuestions = Number(totalQuestions);
    if (uploadDate !== undefined) update.uploadDate = uploadDate ? new Date(uploadDate) : new Date();

    // Parse questions
    if (questions) {
      let parsed = questions;
      if (typeof questions === "string") {
        try {
          parsed = JSON.parse(questions);
        } catch (e) {
          return res.status(400).json({ success: false, message: "Invalid questions format" });
        }
      }

        // ✅ VALIDATION ADD KARO — Sirf Hindi mandatory
  for (let i = 0; i < parsed.length; i++) {
    const q = parsed[i];
    if (!q.questionHindi?.trim()) {
      return res.status(400).json({
        success: false,
        message: `Q${i + 1}: Hindi question text required`,
      });
    }
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      return res.status(400).json({
        success: false,
        message: `Q${i + 1}: Exactly 4 options required`,
      });
    }
    for (let j = 0; j < 4; j++) {
      if (!q.options[j].hindi?.trim()) {
        return res.status(400).json({
          success: false,
          message: `Q${i + 1}, Option ${j + 1}: Hindi option required`,
        });
      }
    }
    if (
      q.correctOption === undefined ||
      q.correctOption < 0 ||
      q.correctOption > 3
    ) {
      return res.status(400).json({
        success: false,
        message: `Q${i + 1}: Correct option must be 0-3`,
      });
    }
  }


      update.questions = parsed;
    }

    // Banner
    if (req.file) {
      // Delete old banner
      const current = await Quiz.findById(req.params.id);
      if (current?.banner?.publicId) {
        try {
          await cloudinary.uploader.destroy(current.banner.publicId, { resource_type: "image" });
        } catch (e) {
          console.error("Old banner delete fail:", e.message);
        }
      }
      update.banner = buildFileObj(req.file);
    }

    if (category) {
      const cat = await Category.findById(category);
      if (cat) {
        update.category = cat._id;
        update.categoryName = cat.name;
        update.categorySlug = cat.slug || cat.name.toLowerCase();
      }
    }

    const quiz = await Quiz.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });
    res.json({ success: true, quiz });
  } catch (err) {
    console.error("Quiz update error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Delete Quiz ----------
app.delete("/api/admin/quizzes/:id", protect, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });

    // ✅ 1. Delete banner from Cloudinary (Storage bachane ke liye)
    if (quiz.banner?.publicId) {
      try {
        await cloudinary.uploader.destroy(quiz.banner.publicId, { resource_type: "image" });
      } catch (e) {
        console.error("Banner delete fail:", e.message);
      }
      // Database se banner details hata do kyunki image delete ho gayi hai
      quiz.banner = { url: null, publicId: null };
    }

    // ✅ 2. SOFT DELETE: Record DB mein rahega (Delta Sync ke liye)
    quiz.isDeleted = true;
    quiz.status = "archived";
    quiz.deletedAt = new Date();
    await quiz.save();

    // ❌ Attempts delete NAHI karenge, analytics ke kaam aayenge
    // await QuizAttempt.deleteMany({ quizId: quiz._id }); 

    res.json({ success: true, message: "Quiz soft-deleted and banner removed" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
//                15b. USER: QUIZ ENDPOINTS
// =====================================================

// ---------- List Quizzes (user) ----------
app.get("/api/user/quizzes", protectUser, async (req, res) => {
  try {
    const { category, subCategory, search, since } = req.query;
    
    //  Base filter: Sirf published aur non-deleted
   const filter = { 
      status: "published", 
      isDeleted: { $ne: true } 
    };
    if (category) filter.categorySlug = category.toLowerCase();
    if (subCategory) filter.subCategory = subCategory;
    if (search) filter.title = { $regex: search, $options: "i" };

    // ✅ DELTA SYNC FILTER
    let deletedIds = [];
    if (since) {
      const sinceDate = new Date(since);
      // Sirf wahi quizzes laao jo 'since' ke baad update hue hain (naya ya edit hua)
      filter.updatedAt = { $gt: sinceDate };
      
      // ✅ Deleted quizzes ki IDs nikaalo (jo since ke baad delete hue)
      const deletedQuizzes = await Quiz.find({
        isDeleted: true,
        deletedAt: { $gt: sinceDate }
      }).select("_id").lean();
      
      deletedIds = deletedQuizzes.map(q => q._id);
    }

    // Fetch quizzes
    const quizzes = await Quiz.find(filter)
      .select("-questions")
      .sort({ createdAt: -1 })
      .lean();

    // Attempts logic (sirf non-deleted quizzes ke liye)
    const quizIds = quizzes.map((q) => q._id);
    const attempts = await QuizAttempt.find({
      userId: req.user._id,
      quizId: { $in: quizIds },
      status: "completed",
    }).sort({ score: -1 }).lean();

    const attemptMap = {};
    attempts.forEach((a) => {
      if (!attemptMap[a.quizId]) {
        attemptMap[a.quizId] = {
          bestScore: a.score,
          attemptId: a._id,
          attempts: 0,
          lastAttemptAt: a.submittedAt,
        };
      }
      attemptMap[a.quizId].attempts += 1;
    });

    const result = quizzes.map((q) => ({
      ...q,
      userBest: attemptMap[q._id] || null,
    }));

    // ✅ Response mein serverTime aur deletedIds bhi bhejo
    res.json({ 
      success: true, 
      quizzes: result,
      deletedIds: deletedIds, // Flutter inko cache se hata dega
      serverTime: new Date().toISOString() // Flutter agle 'since' mein isko use karega
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Get Purchased Quizzes (My Quizzes) ----------
// ⚠️ Yeh /:id se UPAR hona chahiye
app.get("/api/user/quizzes/purchased", protectUser, async (req, res) => {
  try {
    // Get user's purchases
    const purchases = await Purchase.find({
      userId: req.user._id,
      paymentStatus: "completed",
    }).lean();

    // Extract quiz IDs
    const quizIds = [];
    purchases.forEach((p) => {
      (p.items || []).forEach((item) => {
        if (item.contentType === "quiz") {
          quizIds.push(item.contentId);
        }
      });
    });

    if (quizIds.length === 0) {
      return res.json({ success: true, quizzes: [], total: 0 });
    }

    // Get quizzes (hide correct answers)
    const quizzes = await Quiz.find({
      _id: { $in: quizIds },
      status: "published",
      isDeleted: { $ne: true },
    })
      .select("-questions")
      .lean();

    // Get user's attempts for these quizzes
    const attempts = await QuizAttempt.find({
      userId: req.user._id,
      quizId: { $in: quizIds },
    })
      .sort({ submittedAt: -1 })
      .lean();

    const attemptMap = {};
    attempts.forEach((a) => {
      if (!attemptMap[a.quizId]) attemptMap[a.quizId] = [];
      attemptMap[a.quizId].push(a);
    });

    // Enrich quizzes with attempt info
 const result = quizzes.map((q) => {
  const userAttempts = attemptMap[q._id] || [];
  const completed = userAttempts.filter((a) => a.status === "completed");
  
  // ✅ Strict check — status in-progress + no submittedAt
  const inProgress = userAttempts.find(
    (a) =>
      a.status === "in-progress" &&
      !a.submittedAt &&
      !a.completedAt
  );
  
  const bestAttempt = completed.sort((a, b) => b.score - a.score)[0];

  return {
    ...q,
    userAttempts: userAttempts.length,
    completedAttempts: completed.length,
    inProgressAttempt: inProgress || null,
    bestAttempt: bestAttempt || null,
    canAttempt: completed.length < (q.maxAttempts || 1),
    attemptsLeft: Math.max(0, (q.maxAttempts || 1) - completed.length),
  };
});
    res.json({
      success: true,
      quizzes: result,
      total: result.length,
    });
  } catch (err) {
    console.error("Purchased quizzes error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});




// ---------- Get Single Quiz (user) ----------
app.get("/api/user/quizzes/:id", protectUser, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id).lean();
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });

    if (quiz.status !== "published") {
      return res.status(403).json({ success: false, message: "Quiz not available" });
    }


    // Check attempts
    const attemptCount = await QuizAttempt.countDocuments({
      quizId: quiz._id,
      userId: req.user._id,
      status: "completed",
    });

    if (attemptCount >= quiz.maxAttempts) {
      return res.status(403).json({
        success: false,
        message: `Max attempts (${quiz.maxAttempts}) reached`,
      });
    }

    // Hide correct answers
    const sanitized = {
      ...quiz,
      questions: quiz.questions.map((q) => ({
        _id: q._id,
        questionHindi: q.questionHindi,
        questionEnglish: q.questionEnglish,
        options: q.options,
        image: q.image,
        marks: q.marks,
      })),
    };

    res.json({
      success: true,
      quiz: sanitized,
      attemptCount,
      attemptsLeft: quiz.maxAttempts - attemptCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Start Attempt ----------
app.post("/api/user/quizzes/:id/start", protectUser, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });

    // ✅ 1. Delete/Archive check
    if (quiz.isDeleted === true || quiz.status !== "published") {
      return res.status(403).json({
        success: false,
        message: "This quiz is no longer available",
      });
    }

    // =====================================================
    // ✅ 2. NAYA CODE: PRIME MEMBERSHIP / PURCHASE CHECK
    // =====================================================
    const isPaid = (quiz.discountedPrice || 0) > 0 && !quiz.isFree;
    
    if (isPaid) {
      // Check if user is a Prime Member
      const activeSub = await UserSubscription.findOne({
        userId: req.user._id,
        status: "active",
        endDate: { $gt: new Date() }
      });

      // Agar Prime nahi hai, toh direct purchase check karo
      if (!activeSub) {
        const purchased = await Purchase.exists({
          userId: req.user._id,
          paymentStatus: "completed",
          items: { $elemMatch: { contentType: "quiz", contentId: quiz._id } },
        });
        if (!purchased) {
          return res.status(403).json({
            success: false,
            message: "Subscribe to Prime or purchase this quiz",
            code: "PURCHASE_REQUIRED", // Ye code Flutter app kaam aayega
          });
        }
      }
    }
    // =====================================================

    // ✅ 3. Pehle check karo — completed attempts count
    const completedCount = await QuizAttempt.countDocuments({
      quizId: quiz._id,
      userId: req.user._id,
      status: "completed",
    });

    if (completedCount >= quiz.maxAttempts) {
      return res.status(403).json({
        success: false,
        message: `Max attempts (${quiz.maxAttempts}) reached`,
      });
    }

    // ✅ 4. Strict in-progress check (Resume logic)
    const existing = await QuizAttempt.findOne({
      quizId: quiz._id,
      userId: req.user._id,
      status: "in-progress",
      submittedAt: null,
      completedAt: null,
    });

    if (existing) {
      return res.json({ success: true, attempt: existing });
    }

    // ✅ 5. Naya attempt create karo (attemptNumber ke saath)
    const attempt = await QuizAttempt.create({
      quizId: quiz._id,
      userId: req.user._id,
      attemptNumber: completedCount + 1,
      totalMarks: quiz.totalMarks,
      answers: quiz.questions.map((q) => ({
        questionId: q._id,
        selectedOption: null,
        isCorrect: false,
        marksAwarded: 0,
      })),
      status: "in-progress",
      startedAt: new Date(),
    });

    res.json({ success: true, attempt });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Submit Attempt ----------
app.post("/api/user/quizzes/:id/submit", protectUser, async (req, res) => {
  try {
    const { answers } = req.body; // [{ questionId, selectedOption }]

    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, message: "Quiz not found" });

    const attempt = await QuizAttempt.findOne({
  quizId: quiz._id,
  userId: req.user._id,
  status: "in-progress",
  submittedAt: null,      
  completedAt: null,      
});
    if (!attempt) {
      return res.status(404).json({ success: false, message: "No active attempt found" });
    }

    // Process answers
    let correctCount = 0;
    let wrongCount = 0;
    let unattemptedCount = 0;
    let score = 0;

    const processedAnswers = quiz.questions.map((q) => {
      const userAns = answers?.find(
        (a) => a.questionId?.toString() === q._id.toString()
      );
      const selected = userAns?.selectedOption;

      if (selected === null || selected === undefined) {
        unattemptedCount++;
        return {
          questionId: q._id,
          selectedOption: null,
          isCorrect: false,
          marksAwarded: 0,
        };
      }

      const isCorrect = selected === q.correctOption;
      const marksAwarded = isCorrect
        ? q.marks || 1
        : -(q.negativeMarks || 0);

      if (isCorrect) correctCount++;
      else wrongCount++;

      score += marksAwarded;

      return {
        questionId: q._id,
        selectedOption: selected,
        isCorrect,
        marksAwarded,
      };
    });

    const totalMarks = quiz.totalMarks || 1;
    const percentage = Math.max(0, Math.round((score / totalMarks) * 100));

    const now = new Date();
    const timeTaken = Math.floor(
      (now.getTime() - new Date(attempt.startedAt).getTime()) / 1000
    );

    // Update attempt
    attempt.answers = processedAnswers;
    attempt.score = Math.max(0, Math.round(score * 100) / 100);
    attempt.correctCount = correctCount;
    attempt.wrongCount = wrongCount;
    attempt.unattemptedCount = unattemptedCount;
    attempt.percentage = percentage;
    attempt.submittedAt = now;
    attempt.timeTaken = timeTaken;
    attempt.status = "completed";

    attempt.submittedAt = now;
attempt.completedAt = now;  
attempt.status = "completed";
    await attempt.save();


    // Update quiz stats
    quiz.totalAttempts = (quiz.totalAttempts || 0) + 1;
    await quiz.save();

    // Calculate rank
    const higherScores = await QuizAttempt.countDocuments({
      quizId: quiz._id,
      status: "completed",
      score: { $gt: attempt.score },
    });
    const rank = higherScores + 1;

    const totalParticipants = await QuizAttempt.countDocuments({
      quizId: quiz._id,
      status: "completed",
    });

    res.json({
      success: true,
      message: "Quiz submitted",
      attempt: {
        _id: attempt._id,
        score: attempt.score,
        totalMarks: attempt.totalMarks,
        percentage: attempt.percentage,
        correctCount: attempt.correctCount,
        wrongCount: attempt.wrongCount,
        unattemptedCount: attempt.unattemptedCount,
        timeTaken: attempt.timeTaken,
        submittedAt: attempt.submittedAt,
      },
      rank,
      totalParticipants,
      showAnswers: quiz.showAnswers,
      // If showAnswers, return correct options
      answerKey: quiz.showAnswers
        ? quiz.questions.map((q) => ({
            questionId: q._id,
            correctOption: q.correctOption,
          }))
        : null,
    });
  } catch (err) {
    console.error("Quiz submit error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Get My Attempts ----------
app.get("/api/user/quizzes/:id/my-attempts", protectUser, async (req, res) => {
  try {
    const attempts = await QuizAttempt.find({
      quizId: req.params.id,
      userId: req.user._id,
    })
      .sort({ submittedAt: -1 })
      .lean();

    res.json({ success: true, attempts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Leaderboard ----------
app.get("/api/user/quizzes/:id/leaderboard", protectUser, async (req, res) => {
  try {
    const attempts = await QuizAttempt.find({
      quizId: req.params.id,
      status: "completed",
    })
      .sort({ score: -1, timeTaken: 1 })
      .limit(50)
      .populate("userId", "name phone photo")
      .lean();

    const leaderboard = attempts.map((a, i) => ({
      rank: i + 1,
      user: {
        _id: a.userId?._id,
        name: a.userId?.name || "Anonymous",
        photo: a.userId?.photo,
      },
      score: a.score,
      totalMarks: a.totalMarks,
      percentage: a.percentage,
      timeTaken: a.timeTaken,
      submittedAt: a.submittedAt,
    }));

    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Review Attempt (with correct answers) ----------
app.get(
  "/api/user/quizzes/:id/review/:attemptId",
  protectUser,
  async (req, res) => {
    try {
      const quiz = await Quiz.findById(req.params.id).lean();
      if (!quiz) {
        return res.status(404).json({
          success: false,
          message: "Quiz not found",
        });
      }

      const attempt = await QuizAttempt.findOne({
        _id: req.params.attemptId,
        userId: req.user._id,
        quizId: quiz._id,
        status: "completed",
      }).lean();

      if (!attempt) {
        return res.status(404).json({
          success: false,
          message: "Attempt not found",
        });
      }

const questions = quiz.questions.map((q) => {
  const userAns = attempt.answers?.find(
    (a) => String(a.questionId) === String(q._id)
  );

  return {
    _id: q._id,
    questionHindi: q.questionHindi,
    questionEnglish: q.questionEnglish,
    options: q.options,
    correctOption: q.correctOption,
    marks: q.marks,
    negativeMarks: q.negativeMarks,
    //  NAYE FIELDS
    userSelectedOption:
      userAns?.selectedOption !== null && userAns?.selectedOption !== undefined
        ? userAns.selectedOption
        : null,
    isUserCorrect: userAns?.isCorrect || false,
  };
});

      res.json({
        success: true,
        quiz: {
          _id: quiz._id,
          title: quiz.title,
          questions,
        },
        attempt: {
          _id: attempt._id,
          answers: attempt.answers,
          score: attempt.score,
          totalMarks: attempt.totalMarks,
          correctCount: attempt.correctCount,
          wrongCount: attempt.wrongCount,
          unattemptedCount: attempt.unattemptedCount,
          percentage: attempt.percentage,
          timeTaken: attempt.timeTaken,
          submittedAt: attempt.submittedAt,
        },
      });
    } catch (err) {
      console.error("Review error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);



// =====================================================
//                15. ADMIN: STATS
// =====================================================
app.get("/api/admin/stats", protect, async (req, res) => {
  try {
    const [
      totalStudents,
      totalUploads,
      totalAdmins,
      totalEvents,
      totalAssignments,
      totalCategories,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({
        $or: [{ "pdf.url": { $ne: null } }, { "photo.url": { $ne: null } }],
      }),
      Admin.countDocuments(),
      Event.countDocuments(),
      Assignment.countDocuments(),
      Category.countDocuments(),
    ]);

    res.json({
      totalStudents,
      totalUploads,
      revenue: 0,
      totalAdmins,
      totalEvents,
      totalAssignments,
      totalCategories,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// =====================================================
//                ADMIN: SUBSCRIPTION PLANS
// =====================================================
app.get("/api/admin/plans", protect, async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ durationDays: 1 });
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/admin/plans", protect, async (req, res) => {
  try {
    const plan = await SubscriptionPlan.create(req.body);
    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put("/api/admin/plans/:id", protect, async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete("/api/admin/plans/:id", protect, async (req, res) => {
  try {
    await SubscriptionPlan.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================
//                ADMIN: PROMO CODES
// =====================================================
app.get("/api/admin/promos", protect, async (req, res) => {
  try {
    const promos = await PromoCode.find().sort({ createdAt: -1 });
    res.json({ success: true, promos });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/admin/promos", protect, async (req, res) => {
  try {
    const promo = await PromoCode.create(req.body);
    res.json({ success: true, promo });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// =====================================================
//                USER: SUBSCRIPTION & PROMO
// =====================================================

// 1. Fetch Plans
app.get("/api/user/subscription/plans", protectUser, async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ durationDays: 1 });
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Validate Promo Code
app.post("/api/user/subscription/validate-promo", protectUser, async (req, res) => {
  try {
    const { code } = req.body;
    const promo = await PromoCode.findOne({ code: code.toUpperCase(), isActive: true });

    if (!promo) return res.status(404).json({ success: false, message: "Invalid promo code" });
    if (new Date() > promo.validUntil) return res.status(400).json({ success: false, message: "Promo code expired" });
    if (promo.usedCount >= promo.maxUses) return res.status(400).json({ success: false, message: "Promo code usage limit reached" });

    res.json({ 
      success: true, 
      promo: {
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Razorpay Order Create for Subscription
app.post("/api/user/subscription/create-order", protectUser, async (req, res) => {
  try {
    const { planId, promoCode } = req.body;
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });

    let finalAmount = plan.discountedPrice;
    let appliedPromo = null;

    if (promoCode) {
      const promo = await PromoCode.findOne({ code: promoCode.toUpperCase(), isActive: true });
      if (promo && new Date() <= promo.validUntil && promo.usedCount < promo.maxUses) {
        if (promo.discountType === "percentage") {
          finalAmount = finalAmount - (finalAmount * (promo.discountValue / 100));
        } else if (promo.discountType === "free") {
          finalAmount = 0;
        }
        appliedPromo = promo.code;
      }
    }

    // Agar 100% free hai, toh direct response bhej do (Razorpay skip)
    if (finalAmount === 0) {
      return res.json({ success: true, isFree: true, amount: 0, appliedPromo });
    }

    // Razorpay order create karo
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(finalAmount * 100),
      currency: "INR",
      receipt: `prime_${Date.now()}_${req.user._id.toString().slice(-4)}`,
    });

    res.json({
      success: true,
      isFree: false,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
      keyId: process.env.RAZORPAY_KEY_ID,
      appliedPromo,
      finalAmount
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Verify Payment & Activate Subscription
app.post("/api/user/subscription/verify", protectUser, async (req, res) => {
  try {
    const { planId, razorpay_order_id, razorpay_payment_id, razorpay_signature, promoCode } = req.body;
    const plan = await SubscriptionPlan.findById(planId);

    // Verify signature (agar paid hai)
    if (razorpay_order_id && razorpay_signature) {
      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex");
      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: "Invalid payment signature" });
      }
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    // ✅ Check if user already has an active plan (extend it)
    let existingSub = await UserSubscription.findOne({ userId: req.user._id, status: "active" });
    
    if (existingSub && existingSub.endDate > startDate) {
       // Extend from existing end date
       endDate.setTime(existingSub.endDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
       existingSub.endDate = endDate;
       existingSub.planId = planId; // Update to new plan
       existingSub.amountPaid += (razorpay_payment_id ? plan.discountedPrice : 0);
       await existingSub.save();
    } else {
      await UserSubscription.create({
        userId: req.user._id,
        planId,
        startDate,
        endDate,
        status: "active",
        amountPaid: razorpay_payment_id ? plan.discountedPrice : 0,
        promoCodeUsed: promoCode || null,
        paymentId: razorpay_payment_id || "FREE_PROMO",
      });
    }

    // Update Promo Count
    if (promoCode) {
      await PromoCode.findOneAndUpdate({ code: promoCode.toUpperCase() }, { $inc: { usedCount: 1 } });
    }

    res.json({ success: true, message: "Subscription activated successfully", endDate });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// =====================================================
//                16. ADMIN: CATEGORIES
// =====================================================
app.get("/api/admin/categories", protect, async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ order: 1, name: 1 })
      .lean();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post(
  "/api/admin/categories",
  protect,
  categoryUpload.single("image"),
  async (req, res) => {
    try {
      const { name, description, icon, color, order } = req.body;
      if (!name)
        return res
          .status(400)
          .json({ success: false, message: "Name required" });

      const exists = await Category.findOne({ name: name.trim() });
      if (exists)
        return res
          .status(400)
          .json({ success: false, message: "Category already exists" });

      const categoryData = {
        name: name.trim(),
        description: description || "",
        icon: icon || "📁",
        color: color || "indigo",
        order: Number(order) || 0,
      };

      if (req.file) {
        categoryData.image = buildFileObj(req.file);
      }

      const category = await Category.create(categoryData);
      res.json({ success: true, category });
    } catch (err) {
      console.error("Category create error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

app.put(
  "/api/admin/categories/:id",
  protect,
  categoryUpload.single("image"),
  async (req, res) => {
    try {
      const { name, description, icon, color, order } = req.body;
      const update = {};

      if (name) update.name = name;
      if (description !== undefined) update.description = description;
      if (icon) update.icon = icon;
      if (color) update.color = color;
      if (order !== undefined) update.order = Number(order);

      if (req.file) {
        const cat = await Category.findById(req.params.id);
        if (cat?.image?.publicId) {
          try {
            await cloudinary.uploader.destroy(cat.image.publicId, {
              resource_type: "image",
            });
          } catch (e) {
            console.error("Old image delete fail:", e.message);
          }
        }
        update.image = buildFileObj(req.file);
      }

      const category = await Category.findByIdAndUpdate(
        req.params.id,
        update,
        { new: true, runValidators: true }
      );

      if (!category)
        return res
          .status(404)
          .json({ success: false, message: "Category not found" });

      res.json({ success: true, category });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

app.delete("/api/admin/categories/:id", protect, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin") {
      return res
        .status(403)
        .json({ success: false, message: "Only superadmin can delete" });
    }

    const category = await Category.findById(req.params.id);
    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    // ✅ FIXED — dono fields check karo (category + categorySlug)
    const catSlug = category.slug || category.name.toLowerCase();
    const [eventCount, assignCount] = await Promise.all([
      Event.countDocuments({
        $or: [{ category: category._id }, { categorySlug: catSlug }],
      }),
      Assignment.countDocuments({
        $or: [{ category: category._id }, { categorySlug: catSlug }],
      }),
    ]);

    if (eventCount > 0 || assignCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete — ${eventCount} events aur ${assignCount} assignments is category me hain`,
      });
    }

    if (category.image?.publicId) {
      try {
        await cloudinary.uploader.destroy(category.image.publicId, {
          resource_type: "image",
        });
      } catch (e) {
        console.error("Image delete fail:", e.message);
      }
    }

    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
//                17. ADMIN: EVENTS
// =====================================================
app.post(
  "/api/admin/events",
  uploadLimiter,
  protect,
  eventUpload.fields([{ name: "banners", maxCount: 3 }]),
  async (req, res) => {
    try {
      const { eventName, description, eventDate, category } = req.body;

      if (!eventName)
        return res
          .status(400)
          .json({ success: false, message: "Event name required" });
      if (!eventDate)
        return res
          .status(400)
          .json({ success: false, message: "Event date required" });
      if (!category)
        return res
          .status(400)
          .json({ success: false, message: "Category required" });
      if (!req.files?.banners?.length)
        return res
          .status(400)
          .json({ success: false, message: "At least 1 banner required" });

      const cat = await Category.findById(category);
      if (!cat)
        return res
          .status(400)
          .json({ success: false, message: "Invalid category" });

      const banners = req.files.banners.map((f) => buildFileObj(f));

      const event = await Event.create({
        eventName,
        description: description || "",
        category: cat._id,
        categoryName: cat.name,
        categorySlug: cat.slug || cat.name.toLowerCase(),
        banners,
        eventDate: new Date(eventDate),
        sets: [],
        createdBy: req.admin._id,
        createdByName: req.admin.username,
        status: "published",
      });

      res.json({ success: true, event });
    } catch (err) {
      console.error("Event create error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

app.get("/api/admin/events", protect, async (req, res) => {
  try {
    const events = await Event.find().sort({ eventDate: -1 }).lean();
    res.json(events);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/api/admin/events/:id", protect, async (req, res) => {
  try {
    const { eventName, description, eventDate, category } = req.body;
    const update = {};
    if (eventName) update.eventName = eventName;
    if (description !== undefined) update.description = description;
    if (eventDate) update.eventDate = new Date(eventDate);

    if (category) {
      const cat = await Category.findById(category);
      if (cat) {
        update.category = cat._id;
        update.categoryName = cat.name;
        update.categorySlug = cat.slug || cat.name.toLowerCase();
      }
    }

    const event = await Event.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!event)
      return res.status(404).json({ success: false, message: "Event not found" });

    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/admin/events/:id", protect, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event)
      return res.status(404).json({ success: false, message: "Event not found" });

    const toDelete = [];
    event.banners?.forEach((b) => {
      if (b.publicId) toDelete.push({ id: b.publicId, type: "image" });
    });
    event.sets?.forEach((s) => {
      if (s.questionPdf?.publicId)
        toDelete.push({ id: s.questionPdf.publicId, type: "image" });
      if (s.answerPdf?.publicId)
        toDelete.push({ id: s.answerPdf.publicId, type: "image" });
    });

    for (const { id, type } of toDelete) {
      try {
        await cloudinary.uploader.destroy(id, { resource_type: type });
      } catch (e) {
        console.error("Cloudinary delete fail:", e.message);
      }
    }

    await Event.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
//                18. EVENT SETS (with setDate)
// =====================================================
app.post(
  "/api/admin/events/:eventId/sets",
  uploadLimiter,
  protect,
  eventUpload.fields([
    { name: "questionPdf", maxCount: 1 },
    { name: "answerPdf", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { eventId } = req.params;
      const {
        heading,
        description,
        realPrice,
        discountedPrice,
        sellPercentage,
        category,
        subCategory,
        setDate,
      } = req.body;

      if (!heading)
        return res
          .status(400)
          .json({ success: false, message: "Heading required" });
      if (!category)
        return res
          .status(400)
          .json({ success: false, message: "Category required" });
      if (realPrice === undefined || realPrice === "")
        return res
          .status(400)
          .json({ success: false, message: "Real price required" });
      if (discountedPrice === undefined || discountedPrice === "")
        return res
          .status(400)
          .json({ success: false, message: "Discounted price required" });

      const cat = await Category.findById(category);
      if (!cat)
        return res
          .status(400)
          .json({ success: false, message: "Invalid category" });

      const event = await Event.findById(eventId);
      if (!event)
        return res
          .status(404)
          .json({ success: false, message: "Event not found" });

      const newSet = {
        heading,
        description: description || "",
        category: cat._id,
        categoryName: cat.name,
        categorySlug: cat.slug || cat.name.toLowerCase(),
        subCategory: subCategory || "",
        setDate: setDate ? new Date(setDate) : null,
        realPrice: Number(realPrice),
        discountedPrice: Number(discountedPrice),
        sellPercentage: sellPercentage || "medium",
        questionPdf: buildFileObj(req.files?.questionPdf?.[0]),
        answerPdf: buildFileObj(req.files?.answerPdf?.[0]),
        isActive: true,
      };

      event.sets.push(newSet);
      await event.save();

      res.json({ success: true, event });
    } catch (err) {
      console.error("Set add error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

app.put("/api/admin/events/:eventId/sets/:setId", protect, async (req, res) => {
  try {
    const { eventId, setId } = req.params;
    const event = await Event.findById(eventId);
    if (!event)
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });

    const set = event.sets.id(setId);
    if (!set)
      return res.status(404).json({ success: false, message: "Set not found" });

    const {
      heading,
      description,
      realPrice,
      discountedPrice,
      sellPercentage,
      category,
      subCategory,
      setDate,
    } = req.body;

    if (heading) set.heading = heading;
    if (description !== undefined) set.description = description;
    if (realPrice !== undefined) set.realPrice = Number(realPrice);
    if (discountedPrice !== undefined)
      set.discountedPrice = Number(discountedPrice);
    if (sellPercentage) set.sellPercentage = sellPercentage;

    if (category) {
      const cat = await Category.findById(category);
      if (cat) {
        set.category = cat._id;
        set.categoryName = cat.name;
        set.categorySlug = cat.slug || cat.name.toLowerCase();
      }
    }

    if (subCategory !== undefined) {
      set.subCategory = subCategory;
    }

    if (setDate !== undefined) {
      set.setDate = setDate ? new Date(setDate) : null;
    }

    await event.save();
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete(
  "/api/admin/events/:eventId/sets/:setId",
  protect,
  async (req, res) => {
    try {
      const { eventId, setId } = req.params;
      const event = await Event.findById(eventId);
      if (!event)
        return res
          .status(404)
          .json({ success: false, message: "Event not found" });

      const set = event.sets.id(setId);
      if (!set)
        return res
          .status(404)
          .json({ success: false, message: "Set not found" });

      const toDelete = [];
      if (set.questionPdf?.publicId)
        toDelete.push({ id: set.questionPdf.publicId, type: "image" });
      if (set.answerPdf?.publicId)
        toDelete.push({ id: set.answerPdf.publicId, type: "image" });

      for (const { id, type } of toDelete) {
        try {
          await cloudinary.uploader.destroy(id, { resource_type: type });
        } catch (e) {
          console.error("Cloudinary delete fail:", e.message);
        }
      }

      set.deleteOne();
      await event.save();

      res.json({ success: true, event });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// =====================================================
//                19. ADMIN: ASSIGNMENTS
// =====================================================
app.post(
  "/api/admin/assignments",
  uploadLimiter,
  protect,
  assignmentUpload.fields([{ name: "banners", maxCount: 3 }]),
  async (req, res) => {
    try {
      const { universityName, description, assignmentDate, category } =
        req.body;

      if (!universityName)
        return res
          .status(400)
          .json({ success: false, message: "University name required" });
      if (!assignmentDate)
        return res
          .status(400)
          .json({ success: false, message: "Date required" });
      if (!category)
        return res
          .status(400)
          .json({ success: false, message: "Category required" });
      if (!req.files?.banners?.length)
        return res
          .status(400)
          .json({ success: false, message: "At least 1 banner required" });

      const cat = await Category.findById(category);
      if (!cat)
        return res
          .status(400)
          .json({ success: false, message: "Invalid category" });

      const banners = req.files.banners.map((f) => buildFileObj(f));

      const assignment = await Assignment.create({
        universityName,
        description: description || "",
        category: cat._id,
        categoryName: cat.name,
        categorySlug: cat.slug || cat.name.toLowerCase(),
        banners,
        assignmentDate: new Date(assignmentDate),
        sets: [],
        createdBy: req.admin._id,
        createdByName: req.admin.username,
        status: "published",
      });

      res.json({ success: true, assignment });
    } catch (err) {
      console.error("Assignment create error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

app.get("/api/admin/assignments", protect, async (req, res) => {
  try {
    const { university } = req.query;
    const filter = {};
    if (university) filter.universityName = university;

    const assignments = await Assignment.find(filter)
      .sort({ assignmentDate: -1 })
      .lean();
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/api/admin/assignments/:id", protect, async (req, res) => {
  try {
    const { universityName, description, assignmentDate, category } =
      req.body;
    const update = {};
    if (universityName) update.universityName = universityName;
    if (description !== undefined) update.description = description;
    if (assignmentDate) update.assignmentDate = new Date(assignmentDate);

    if (category) {
      const cat = await Category.findById(category);
      if (cat) {
        update.category = cat._id;
        update.categoryName = cat.name;
        update.categorySlug = cat.slug || cat.name.toLowerCase();
      }
    }

    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!assignment)
      return res
        .status(404)
        .json({ success: false, message: "Assignment not found" });

    res.json({ success: true, assignment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/admin/assignments/:id", protect, async (req, res) => {
  try {
    const a = await Assignment.findById(req.params.id);
    if (!a)
      return res.status(404).json({ success: false, message: "Not found" });

    const toDelete = [];
    a.banners?.forEach((b) => {
      if (b.publicId) toDelete.push({ id: b.publicId, type: "image" });
    });
    a.sets?.forEach((s) => {
      if (s.questionPdf?.publicId)
        toDelete.push({ id: s.questionPdf.publicId, type: "image" });
      if (s.answerPdf?.publicId)
        toDelete.push({ id: s.answerPdf.publicId, type: "image" });
    });

    for (const { id, type } of toDelete) {
      try {
        await cloudinary.uploader.destroy(id, { resource_type: type });
      } catch (e) {
        console.error("Cloudinary delete fail:", e.message);
      }
    }

    await Assignment.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
//                20. ASSIGNMENT SETS
// =====================================================
app.post(
  "/api/admin/assignments/:assignmentId/sets",
  uploadLimiter,
  protect,
  assignmentUpload.fields([
    { name: "questionPdf", maxCount: 1 },
    { name: "answerPdf", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { assignmentId } = req.params;
      const {
        courseName,
        heading,
        subject,
        description,
        dueDate,
        category,
        subCategory,
      } = req.body;

      if (!courseName)
        return res
          .status(400)
          .json({ success: false, message: "Course name required" });
      if (!heading)
        return res
          .status(400)
          .json({ success: false, message: "Heading required" });
      if (!category)
        return res
          .status(400)
          .json({ success: false, message: "Category required" });

      const cat = await Category.findById(category);
      if (!cat)
        return res
          .status(400)
          .json({ success: false, message: "Invalid category" });

      const assignment = await Assignment.findById(assignmentId);
      if (!assignment)
        return res
          .status(404)
          .json({ success: false, message: "Assignment not found" });

      const newSet = {
        courseName,
        heading,
        subject: subject || "",
        description: description || "",
        category: cat._id,
        categoryName: cat.name,
        categorySlug: cat.slug || cat.name.toLowerCase(),
        subCategory: subCategory || "",
        questionPdf: buildFileObj(req.files?.questionPdf?.[0]),
        answerPdf: buildFileObj(req.files?.answerPdf?.[0]),
        dueDate: dueDate ? new Date(dueDate) : null,
        isActive: true,
      };

      assignment.sets.push(newSet);
      await assignment.save();

      res.json({ success: true, assignment });
    } catch (err) {
      console.error("Assignment set add error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

app.put(
  "/api/admin/assignments/:assignmentId/sets/:setId",
  protect,
  async (req, res) => {
    try {
      const { assignmentId, setId } = req.params;
      const assignment = await Assignment.findById(assignmentId);
      if (!assignment)
        return res
          .status(404)
          .json({ success: false, message: "Assignment not found" });

      const set = assignment.sets.id(setId);
      if (!set)
        return res
          .status(404)
          .json({ success: false, message: "Set not found" });

      const {
        courseName,
        heading,
        subject,
        description,
        dueDate,
        category,
        subCategory,
      } = req.body;

      if (courseName) set.courseName = courseName;
      if (heading) set.heading = heading;
      if (subject !== undefined) set.subject = subject;
      if (description !== undefined) set.description = description;
      if (dueDate) set.dueDate = new Date(dueDate);

      if (category) {
        const cat = await Category.findById(category);
        if (cat) {
          set.category = cat._id;
          set.categoryName = cat.name;
          set.categorySlug = cat.slug || cat.name.toLowerCase();
        }
      }

      if (subCategory !== undefined) {
        set.subCategory = subCategory;
      }

      await assignment.save();
      res.json({ success: true, assignment });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

app.delete(
  "/api/admin/assignments/:assignmentId/sets/:setId",
  protect,
  async (req, res) => {
    try {
      const { assignmentId, setId } = req.params;
      const assignment = await Assignment.findById(assignmentId);
      if (!assignment)
        return res
          .status(404)
          .json({ success: false, message: "Assignment not found" });

      const set = assignment.sets.id(setId);
      if (!set)
        return res
          .status(404)
          .json({ success: false, message: "Set not found" });

      const toDelete = [];
      if (set.questionPdf?.publicId)
        toDelete.push({ id: set.questionPdf.publicId, type: "image" });
      if (set.answerPdf?.publicId)
        toDelete.push({ id: set.answerPdf.publicId, type: "image" });

      for (const { id, type } of toDelete) {
        try {
          await cloudinary.uploader.destroy(id, { resource_type: type });
        } catch (e) {
          console.error("Cloudinary delete fail:", e.message);
        }
      }

      set.deleteOne();
      await assignment.save();

      res.json({ success: true, assignment });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);


// =====================================================
//                21a. ADMIN: ENQUIRIES (LIST)
// =====================================================
app.get("/api/admin/enquiries", protect, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const enquiries = await Enquiry.find(filter)
      .populate("userId", "name phone email")
      .sort({ createdAt: -1 })
      .lean();

    res.json(enquiries);
  } catch (err) {
    console.error("Admin enquiry list error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
//                21b. ADMIN: ENQUIRY UPDATE
// =====================================================
app.put("/api/admin/enquiries/:id", protect, async (req, res) => {
  try {
    const { status, adminResponse } = req.body;

    const update = {};

    if (status) {
      const validStatuses = ["pending", "in-progress", "resolved", "closed"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
        });
      }
      update.status = status;

      if (status === "in-progress") {
        update.calledAt = new Date();
        update.calledBy = req.admin._id;
      }
    }

    if (adminResponse !== undefined) {
      update.adminResponse = adminResponse;
      update.respondedBy = req.admin._id;
      update.respondedAt = new Date();
    }

    const enquiry = await Enquiry.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).populate("userId", "name phone email");

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: "Enquiry not found",
      });
    }

    res.json({ success: true, enquiry });
  } catch (err) {
    console.error("Admin enquiry update error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// =====================================================
//                21. ADMIN: MANAGE ADMINS
// =====================================================
app.get("/api/admin/list", protect, async (req, res) => {
  try {
    const admins = await Admin.find()
      .select("-password -refreshToken")
      .sort({ createdAt: -1 })
      .lean();
    res.json(admins);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/create", protect, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin")
      return res
        .status(403)
        .json({ success: false, message: "Only superadmin can create admins" });

    const { username, email, password, role } = req.body;
    if (!username || !email || !password)
      return res
        .status(400)
        .json({ success: false, message: "All fields required" });
    if (password.length < 8)
      return res
        .status(400)
        .json({ success: false, message: "Password must be 8+ chars" });

    const exists = await Admin.findOne({ $or: [{ username }, { email }] });
    if (exists)
      return res
        .status(400)
        .json({ success: false, message: "Username/email exists" });

    const admin = await Admin.create({
      username,
      email,
      password,
      role: role || "admin",
    });

    res.json({
      success: true,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/admin/delete/:id", protect, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin")
      return res
        .status(403)
        .json({ success: false, message: "Only superadmin" });

    const target = await Admin.findById(req.params.id);
    if (!target)
      return res.status(404).json({ success: false, message: "Not found" });
    if (target.role === "superadmin")
      return res
        .status(403)
        .json({ success: false, message: "Cannot delete superadmin" });
    if (target._id.toString() === req.admin._id.toString())
      return res
        .status(403)
        .json({ success: false, message: "Cannot delete yourself" });

    await Admin.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/change-password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res
        .status(400)
        .json({ success: false, message: "Both passwords required" });
    if (newPassword.length < 8)
      return res
        .status(400)
        .json({ success: false, message: "New password must be 8+ chars" });

    const admin = await Admin.findById(req.admin._id).select("+password");
    const ok = await admin.comparePassword(currentPassword);
    if (!ok)
      return res
        .status(400)
        .json({ success: false, message: "Current password wrong" });

    admin.password = newPassword;
    await admin.save();

    res.json({ success: true, message: "Password updated" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================================
//   RATE LIMITERS — Sab routes ke BAAD
// =====================================================

// app.use("/api/admin", adminLimiter);
// app.use("/api/user/auth", authLimiter);
// app.use("/api/user", userLimiter);
// app.use("/api/user", (req, res, next) => {
//   if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
//     return writeLimiter(req, res, next);
//   }
//   next();
// });
// app.use("/api/user", (req, res, next) => {
//   if (req.method === "GET") {
//     return readLimiter(req, res, next);
//   }
//   next();
// });

// =====================================================
//                22. ERROR HANDLERS
// =====================================================
app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  if (err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      message:
        err.code === "LIMIT_FILE_SIZE"
          ? "File too large. Max 20MB for PDF, 5MB for images."
          : err.message,
    });
  }
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Server error",
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// =====================================================
//                23. SEED CATEGORIES
// =====================================================
const seedCategories = async () => {
  try {
    const count = await Category.countDocuments();
    if (count === 0) {
      await Category.insertMany([
        {
          name: "UPSC & State PSC",
          icon: "🏛️",
          description: "Civil Services, IAS, IPS, State PSC exams",
          order: 1,
        },
        {
          name: "State Government Exam",
          icon: "🏢",
          description: "State level government job exams",
          order: 2,
        },
        {
          name: "NEET / JEE",
          icon: "🩺",
          description: "Medical & Engineering entrance exams",
          order: 3,
        },
        {
          name: "Defence",
          icon: "🎖️",
          description: "Army, Navy, Air Force, NDA, CDS",
          order: 4,
        },
        {
          name: "Police",
          icon: "👮",
          description: "Police constable, SI, and other police exams",
          order: 5,
        },
        {
          name: "SSC",
          icon: "📋",
          description: "Staff Selection Commission exams",
          order: 6,
        },
        {
          name: "Railway",
          icon: "🚂",
          description: "RRB NTPC, Group D, ALP exams",
          order: 7,
        },
        {
          name: "Teaching",
          icon: "📚",
          description: "CTET, TET, KVS, and teaching exams",
          order: 8,
        },
        {
          name: "Bank",
          icon: "🏦",
          description: "IBPS, SBI, RBI, and banking exams",
          order: 9,
        },
        {
          name: "University",
          icon: "🎓",
          description: "University courses, assignments and study material",
          order: 10,
        },
      ]);
      console.log("Default categories seeded (10 total)");
    }
  } catch (err) {
    console.error("Seed error:", err.message);
  }
};




// =====================================================
//                24. START SERVER
// =====================================================
const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  await seedCategories();
  try {
    const { warmUpCache } = await import("./src/utils/cacheWarmup.js");
    await warmUpCache();
  } catch (e) {
    console.warn("Cache warmup failed:", e.message);
  }

  const server = app.listen(PORT,"0.0.0.0",() => {
    console.log(`Backend: http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME}`);
  });

  server.timeout = 180000;
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
};

start();