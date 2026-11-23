// // File: backend/src/routes/downloadRoutes.js

// import express from "express";
// import rateLimit, { ipKeyGenerator } from "express-rate-limit";   // ✅ ipKeyGenerator import
// import { protectUser } from "../middleware/auth.js";
// import { getDownloadUrl } from "../controllers/downloadController.js";

// const router = express.Router();

// // ✅ Download rate limiter — 30/min per user
// const downloadLimiter = rateLimit({
//   windowMs: 60 * 1000,
//   max: 30,
//   keyGenerator: (req, res) => {
//     // ✅ User ID agar logged in hai
//     if (req.user?._id) return req.user._id.toString();

//     // ✅ Fallback — IP (ipKeyGenerator helper ke saath)
//     return ipKeyGenerator(req.ip);
//   },
//   message: {
//     success: false,
//     message: "Too many downloads. Please wait a minute.",
//   },
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// router.get(
//   "/:purchaseId/:setId/:type",
//   downloadLimiter,
//   protectUser,
//   getDownloadUrl
// );

// export default router;



// File: backend/src/routes/downloadRoutes.js

import express from "express";
import { protectUser } from "../middleware/auth.js";
import { downloadLimiter } from "../middleware/rateLimiter.js";
import { getDownloadUrl } from "../controllers/downloadController.js";

const router = express.Router();

// Rate limit → auth → download
// (peekAuth ne req.user._id set kar diya hai, toh user-wise limiter kaam karega)
router.get(
  "/:purchaseId/:setId/:type",
  downloadLimiter,
  protectUser,
  getDownloadUrl
);

export default router;