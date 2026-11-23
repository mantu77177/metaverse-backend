// File: backend/src/controllers/purchaseController.js

import Purchase from "../models/Purchase.js";

// =====================================================
//   GET ALL PURCHASES (My Assets)
// =====================================================
export const getMyPurchases = async (req, res) => {
  try {
    const userId = req.user._id;

    const purchases = await Purchase.find({
      userId,
      paymentStatus: "completed",
    })
      .sort({ purchasedAt: -1 })
      .lean();

    // ✅ Flatten items from all purchases into single list
    // Each item = one "asset" the user owns
    const assets = [];
    purchases.forEach((p) => {
      p.items.forEach((item) => {
        assets.push({
          ...item,
          purchaseId: p._id,
          paymentId: p.paymentId,
          purchasedAt: item.purchasedAt || p.purchasedAt,
        });
      });
    });

    // Sort assets by purchasedAt (newest first)
    assets.sort(
      (a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt)
    );

    res.json({
      success: true,
      assets,
      totalAssets: assets.length,
      totalPurchases: purchases.length,
    });
  } catch (err) {
    console.error("Get purchases error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// =====================================================
//   GET SINGLE ASSET (verify access + return PDFs)
// =====================================================
export const getAssetById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { purchaseId, setId } = req.params;

    const purchase = await Purchase.findOne({
      _id: purchaseId,
      userId,
      paymentStatus: "completed",
    }).lean();

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found or access denied",
      });
    }

    const item = purchase.items.find(
      (i) => i.setId.toString() === setId.toString()
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Asset not found in this purchase",
      });
    }

    res.json({
      success: true,
      asset: {
        ...item,
        purchaseId: purchase._id,
        paymentId: purchase.paymentId,
        purchasedAt: item.purchasedAt || purchase.purchasedAt,
      },
    });
  } catch (err) {
    console.error("Get asset error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// =====================================================
//   CHECK IF SET IS PURCHASED (for Cart/SetCard lock state)
// =====================================================
export const isPurchased = async (req, res) => {
  try {
    const userId = req.user._id;
    const { setId } = req.params;

    const exists = await Purchase.exists({
      userId,
      paymentStatus: "completed",
      "items.setId": setId,
    });

    res.json({ success: true, purchased: !!exists });
  } catch (err) {
    console.error("Is purchased error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};