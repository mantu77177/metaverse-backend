// File: backend/src/config/razorpay.js

import dotenv from "dotenv";
dotenv.config(); 

import Razorpay from "razorpay";

// ✅ Validate env vars
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn(
    "⚠️  Razorpay keys missing in .env — payment will fail.\n" +
    "   Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET"
  );
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export default razorpay;