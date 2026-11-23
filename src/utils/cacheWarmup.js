// File: backend/src/utils/cacheWarmup.js

import Category from "../models/Category.js";
import Event from "../models/Event.js";
import Assignment from "../models/Assignment.js";
import cache from "./cache.js";

export const warmUpCache = async () => {
  console.log("🔥 Warming up cache...");

  const [categories, eventCounts, assignmentCounts] = await Promise.all([
    Category.find({ isActive: true }).sort({ order: 1, name: 1 }).lean(),
    Event.aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$categorySlug", count: { $sum: 1 } } },
    ]),
    Assignment.aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$categorySlug", count: { $sum: 1 } } },
    ]),
  ]);

  const eventMap = eventCounts.reduce((acc, e) => {
    acc[e._id] = e.count;
    return acc;
  }, {});

  const assignmentMap = assignmentCounts.reduce((acc, a) => {
    acc[a._id] = a.count;
    return acc;
  }, {});

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

  await cache.set("categories:all", { success: true, categories: categoriesWithCounts }, 300);

    // ✅ Events warmup — first page (20)
  const events = await Event.find({ status: "published" })
    .sort({ _id: -1 })
    .limit(20)
    .lean();
  await cache.set(
    "events:::20::",
    {
      success: true,
      events,
      pagination: { hasMore: false, nextCursor: null, count: events.length },
    },
    60
  );

  // ✅ Assignments warmup (no filter, default)
  const assignments = await Assignment.find({ status: "published" })
    .sort({ assignmentDate: -1 })
    .lean();
  await cache.set("assignments::::", { success: true, assignments }, 60);

  console.log("✅ Cache warmed up (categories + events + assignments)");

};