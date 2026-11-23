// File: backend/seedAdmin.js

import mongoose from "mongoose";
import dotenv from "dotenv";
import Admin from "./src/models/Admin.js";

dotenv.config();

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      family: 4,
    });

    console.log("✅ Connected to MongoDB");

    const username = "superadmin";
    const email = "superadmin@example.com";
    const password = "SuperAdmin@123"; // ✅ isko change karo production me

    const existing = await Admin.findOne({ username });
    if (existing) {
      console.log("⚠️  Admin already exists:", username);
      process.exit(0);
    }

    await Admin.create({
      username,
      email,
      password,
      role: "superadmin",
    });

    console.log("🎉 Superadmin created!");
    console.log("   Username:", username);
    console.log("   Password:", password);
    console.log("   ⚠️  Change password immediately after login!");

    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err.message);
    process.exit(1);
  }
};

seed();