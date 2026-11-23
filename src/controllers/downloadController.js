// File: backend/src/controllers/downloadController.js

import cloudinary from "../config/cloudinary.js";
import Purchase from "../models/Purchase.js";

export const getDownloadUrl = async (req, res) => {
  try {
    const { purchaseId, setId, type } = req.params;
    const userId = req.user._id;

    if (!["question", "answer"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Use 'question' or 'answer'",
      });
    }

    // ✅ Purchase verify
    const purchase = await Purchase.findOne({
      _id: purchaseId,
      userId,
      paymentStatus: "completed",
    }).lean();

    if (!purchase) {
      return res.status(404).json({
        success: false,
        message: "Purchase not found",
      });
    }

    const item = purchase.items.find(
      (i) => i.setId.toString() === setId.toString()
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Asset not found",
      });
    }

    const pdf = type === "answer" ? item.answerPdf : item.questionPdf;
    if (!pdf || !pdf.url) {
      return res.status(404).json({
        success: false,
        message: "PDF not available",
      });
    }

    // ✅ publicId nikalo
    let publicId = pdf.publicId;

    if (!publicId) {
      const urlParts = pdf.url.split("/upload/");
      if (urlParts.length > 1) {
        publicId = urlParts[1]
          .replace(/^v\d+\//, "")           // version hatao
          .replace(/\.pdf$/i, "");          // .pdf hatao (Cloudinary khud add karega)
      }
    }

    if (!publicId) {
      return res.status(500).json({
        success: false,
        message: "Cannot extract publicId",
      });
    }

    // ✅ DEBUG LOG
    console.log("🔍 Download URL request:", {
      purchaseId,
      setId,
      type,
      publicId,
    });

    // ✅ Signed URL (5 min expiry)
    const expiresAt = Math.floor(Date.now() / 1000) + 300;

    const signedUrl = cloudinary.utils.private_download_url(
      publicId,
      "pdf",
      {
        resource_type: "image",        // ✅ image — raw NAHI
        type: "upload",
        expires_at: expiresAt,
        attachment: true,              // ✅ true — force download
      }
    );

    res.json({
      success: true,
      url: signedUrl,
      expiresAt,
      fileName: pdf.name || `${type}.pdf`,
    });
  } catch (err) {
    console.error("Download URL error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};