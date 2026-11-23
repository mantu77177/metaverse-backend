// File: backend/src/controllers/paymentController.js

import crypto from "crypto";
import mongoose from "mongoose";                          // ✅ NAYA
import razorpay from "../config/razorpay.js";
import Cart from "../models/Cart.js";
import Purchase from "../models/Purchase.js";

// =====================================================
//   1. CREATE ORDER (Razorpay)
// =====================================================
export const createOrder = async (req, res) => {
  try {
    const userId = req.user._id;

    // ---------- 1. Get user's cart ----------
    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || !cart.items?.length) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty. Add items before checkout.",
      });
    }

    // ---------- 2. Calculate total ----------
    const totalAmount = cart.items.reduce(
      (sum, i) => sum + (i.discountedPrice || 0),
      0
    );

    if (totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart total.",
      });
    }

    // ---------- 3. Create Razorpay order ----------
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100),
      currency: "INR",
      receipt: `rcpt_${Date.now()}_${userId.toString().slice(-6)}`,
      notes: {
        userId: userId.toString(),
        itemCount: cart.items.length,
      },
    });

    res.json({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt,
      },
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create order",
      error: err.message,
    });
  }
};

// =====================================================
//   2. VERIFY PAYMENT (Signature + Purchase create)
//   ✅ TRANSACTION ke saath — atomic operation
// =====================================================
export const verifyPayment = async (req, res) => {
  // ✅ 1. Session start karo
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user._id;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    // ---------- 1. Validate inputs ----------
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Missing payment verification fields",
      });
    }

    // ---------- 2. Verify signature (HMAC SHA256) ----------
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.error("❌ Invalid signature:", {
        expected: expectedSignature,
        received: razorpay_signature,
      });
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // ---------- 3. Idempotency check ----------
    const existing = await Purchase.findOne({
      paymentId: razorpay_payment_id,
    }).session(session);

    if (existing) {
      await session.abortTransaction();
      return res.json({
        success: true,
        message: "Purchase already recorded",
        purchase: {
          id: existing._id,
          paymentId: existing.paymentId,
          totalAmount: existing.totalAmount,
          itemCount: existing.items.length,
          purchasedAt: existing.purchasedAt,
        },
      });
    }

    // ---------- 4. Get user's cart (session me) ----------
    const cart = await Cart.findOne({ userId }).session(session);
    if (!cart || !cart.items?.length) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Cart is empty. Cannot record purchase.",
      });
    }

    // ---------- 5. Build purchase items ----------
    const purchaseItems = cart.items.map((item) => ({
      contentId: item.contentId,
      contentType: item.contentType,
      setId: item.setId,
      heading: item.heading || "",
      title: item.title || "",
      banner: item.banner || "",
      description: item.description || "",
      setDate: item.setDate || null,
      uploadDate: item.uploadDate || null,
      subCategory: item.subCategory || "",
      durationMinutes: item.durationMinutes || 0,
      totalQuestions: item.totalQuestions || 0,
      totalMarks: item.totalMarks || 0,
      maxAttempts: item.maxAttempts || 1,
      questionPdf: item.questionPdf || null,
      answerPdf: item.answerPdf || null,
      realPrice: item.realPrice || 0,
      discountedPrice: item.discountedPrice || 0,
      purchasedAt: new Date(),
    }));

    const totalAmount = purchaseItems.reduce(
      (sum, i) => sum + (i.discountedPrice || 0),
      0
    );

    // ---------- 6. Create purchase (session me) ----------
    const [purchase] = await Purchase.create(
      [
        {
          userId,
          paymentId: razorpay_payment_id,
          paymentMethod: "razorpay",
          paymentStatus: "completed",
          totalAmount,
          currency: "INR",
          items: purchaseItems,
          notes: `Razorpay order: ${razorpay_order_id}`,
          purchasedAt: new Date(),
        },
      ],
      { session }
    );

    // ---------- 7. Clear cart (session me) ----------
    await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [] } },
      { session }
    );

    // ✅ 8. Commit — sab kuch ya kuch bhi nahi
    await session.commitTransaction();

    console.log(`✅ Payment verified: user=${userId} payment=${razorpay_payment_id}`);

    res.json({
      success: true,
      message: "Payment verified & purchase recorded",
      purchase: {
        id: purchase._id,
        paymentId: purchase.paymentId,
        totalAmount: purchase.totalAmount,
        itemCount: purchase.items.length,
        purchasedAt: purchase.purchasedAt,
      },
    });
  } catch (err) {
    // ❌ 9. Rollback — error pe sab undo
    await session.abortTransaction();
    console.error("Verify payment error:", err);
    res.status(500).json({
      success: false,
      message: "Payment verification failed",
      error: err.message,
    });
  } finally {
    // ✅ 10. Session end
    session.endSession();
  }
};