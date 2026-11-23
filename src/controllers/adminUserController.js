// File: backend/src/controllers/adminUserController.js

import mongoose from "mongoose";
import User from "../models/User.js";
import Cart from "../models/Cart.js";
import Wishlist from "../models/Wishlist.js";
import Purchase from "../models/Purchase.js";
import UserSubscription from "../models/UserSubscription.js"; // ✅ NAYA IMPORT

export const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🔍 Fetching details for user:", id);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    // ✅ Promise.all mein activeSub add kar diya
    const [user, cart, wishlist, purchases, activeSub] = await Promise.all([
      User.findById(id).select("-refreshTokens").lean(),
      Cart.findOne({ userId: id }).lean(),
      Wishlist.findOne({ userId: id }).lean(),
      Purchase.find({ userId: id }).sort({ purchasedAt: -1 }).lean(),
      // Active subscription fetch karo (aur plan details populate karo)
      UserSubscription.findOne({
        userId: id,
        status: "active",
        endDate: { $gt: new Date() } // Aaj se badi honi chahiye
      }).populate("planId", "name durationDays").lean()
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const cartItems = cart?.items || [];
    const wishlistItems = wishlist?.items || [];

    const allAssets = [];
    purchases.forEach((p) => {
      (p.items || []).forEach((item) => {
        allAssets.push({
          ...item,
          purchaseId: p._id,
          paymentId: p.paymentId,
          orderPurchasedAt: p.purchasedAt,
        });
      });
    });

    const totalSpent = purchases.reduce(
      (sum, p) => sum + (p.totalAmount || 0),
      0
    );
    const cartValue = cartItems.reduce(
      (sum, i) => sum + (i.discountedPrice || 0),
      0
    );
    const wishlistValue = wishlistItems.reduce(
      (sum, i) => sum + (i.discountedPrice || 0),
      0
    );

    res.json({
      success: true,
      user,
      stats: {
        totalPurchases: purchases.length,
        totalAssets: allAssets.length,
        totalSpent,
        cartCount: cartItems.length,
        cartValue,
        wishlistCount: wishlistItems.length,
        wishlistValue,
        loginCount: user.loginCount || 0,
      },
      cart: {
        items: cartItems,
        updatedAt: cart?.updatedAt || null,
      },
      wishlist: {
        items: wishlistItems,
        updatedAt: wishlist?.updatedAt || null,
      },
      purchases: purchases.map((p) => ({
        _id: p._id,
        paymentId: p.paymentId,
        paymentMethod: p.paymentMethod,
        paymentStatus: p.paymentStatus,
        totalAmount: p.totalAmount,
        currency: p.currency,
        itemCount: p.items?.length || 0,
        items: p.items || [],
        purchasedAt: p.purchasedAt,
        notes: p.notes,
      })),
      // ✅ NAYA: Response mein membership data bhejo
      membership: activeSub || null,
    });
  } catch (err) {
    console.error("Get user details error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};