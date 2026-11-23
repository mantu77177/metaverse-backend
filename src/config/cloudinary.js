// File: backend/src/config/cloudinary.js

import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
    timeout: 120000,  // ✅ 2 minute
});

// ✅ Enterprise upload options
export const uploadOptions = {
  // Auto quality + format (WebP/AVIF)
  quality: "auto:best",
  fetch_format: "auto",

  // Image transforms (Cloudinary server pe)
  transformation: [
    { width: 1600, height: 1600, crop: "limit" }, // Bade images resize
    { quality: "auto:good" },
    { fetch_format: "auto" },
  ],

  // Flags
  flags: "progressive", // Progressive JPEG
  resource_type: "auto", // Auto detect (image/video/raw)

  // Overwrite & unique
  unique_filename: true,
  overwrite: false,
  use_filename: false,
};

// Banner-specific (bigger, hero images)
export const bannerOptions = {
  ...uploadOptions,
  transformation: [
    { width: 2000, height: 1200, crop: "limit" },
    { quality: "auto:good" },
    { fetch_format: "auto" },
  ],
};

// PDF-specific options
export const pdfOptions = {
  resource_type: "raw", // PDF as raw file
  unique_filename: true,
  overwrite: false,
  use_filename: true,
  folder: "uploadApp/pdfs",
};

export default cloudinary;