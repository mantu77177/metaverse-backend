// File: backend/src/middleware/upload.js

import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

// ---------- Limits ----------
const IMAGE_LIMIT = (Number(process.env.MAX_IMAGE_SIZE_MB) || 5) * 1024 * 1024;
const PDF_LIMIT = (Number(process.env.MAX_PDF_SIZE_MB) || 20) * 1024 * 1024;

// =====================================================
//   ✅ SAFE FILENAME SANITIZER
//   - Removes special chars that Cloudinary rejects
//   - Handles Unicode, spaces, &, (), etc.
// =====================================================
const sanitizeFileName = (originalName = "") => {
  // 1. Remove file extension (hum sirf base name sanitize karenge)
  const lastDot = originalName.lastIndexOf(".");
  const baseName =
    lastDot > 0 ? originalName.slice(0, lastDot) : originalName;
  const extension = lastDot > 0 ? originalName.slice(lastDot + 1) : "";

  // 2. Sanitize base name
  const sanitizedBase = baseName
    // Unicode → ASCII (â → a, é → e, etc.)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Spaces → underscore
    .replace(/\s+/g, "_")
    // Sirf allowed chars: letters, numbers, underscore, hyphen, dot
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    // Multiple underscores/dots → single
    .replace(/_+/g, "_")
    .replace(/\.+/g, ".")
    // Leading/trailing special chars remove
    .replace(/^[_.-]+|[_.-]+$/g, "")
    // Max 80 chars
    .slice(0, 80);

  // 3. Sanitize extension
  const sanitizedExt = extension
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);

  // 4. Fallback if base is empty
  const finalBase = sanitizedBase || "file";
  const finalExt = sanitizedExt ? `.${sanitizedExt}` : "";

  return `${finalBase}${finalExt}`;
};

// ---------- Cloudinary Params Builder ----------
const buildParams = (options) => async (req, file) => {
  const {
    folderMap,
    isPdfField,
    avatarFields = [],
    wideImageFields = [],
    smallImageFields = [],
  } = options;

  const isPdf = isPdfField(file.fieldname);
  const isAvatar = avatarFields.includes(file.fieldname);
  const isWide = wideImageFields.includes(file.fieldname);
  const isSmall = smallImageFields.includes(file.fieldname);

  let transformation;

  if (isPdf) {
    transformation = undefined;
  } else if (isAvatar) {
    transformation = [
      { width: 400, height: 400, crop: "fill", gravity: "face" },
      { quality: "auto:good" },
      { fetch_format: "auto" },
    ];
  } else if (isSmall) {
    transformation = [
      { width: 600, height: 400, crop: "fill" },
      { quality: "auto:good" },
      { fetch_format: "auto" },
    ];
  } else if (isWide) {
    transformation = [
      { width: 2000, height: 1200, crop: "limit" },
      { quality: "auto:good" },
      { fetch_format: "auto" },
    ];
  } else {
    transformation = [
      { width: 1200, height: 1200, crop: "limit" },
      { quality: "auto:good" },
      { fetch_format: "auto" },
    ];
  }

  // ✅ SANITIZED FILENAME
const safeName = sanitizeFileName(file.originalname || "file");

const publicIdName = isPdf
  ? safeName.replace(/\.pdf$/i, "")     // "abc.pdf" → "abc"
  : safeName;


return {
  folder: folderMap[file.fieldname] || "uploadApp/misc",
  resource_type: "image",                    // ✅ image
  allowed_formats: isPdf
    ? ["pdf"]
    : ["jpg", "jpeg", "png", "webp", "gif"],
  ...(isPdf ? {} : { transformation }),
   public_id: `${Date.now()}-${publicIdName}`, 
};
};

// ---------- User Storage ----------
const userStorage = new CloudinaryStorage({
  cloudinary,
  params: buildParams({
    folderMap: {
      pdf: "uploadApp/user-uploads/pdf",
      photo: "uploadApp/user-uploads/photo",
      avatar: "uploadApp/user-avatars",
    },
    isPdfField: (field) => field === "pdf",
    avatarFields: ["avatar"],
  }),
});

// ---------- Event Storage ----------
const eventStorage = new CloudinaryStorage({
  cloudinary,
  params: buildParams({
    folderMap: {
      banners: "uploadApp/events/banners",
      questionPdf: "uploadApp/sets/question",
      answerPdf: "uploadApp/sets/answer",
    },
    isPdfField: (field) => field === "questionPdf" || field === "answerPdf",
    wideImageFields: ["banners"],
  }),
});

// ---------- Assignment Storage ----------
const assignmentStorage = new CloudinaryStorage({
  cloudinary,
  params: buildParams({
    folderMap: {
      banners: "uploadApp/assignments/banners",
      questionPdf: "uploadApp/assignment-sets/question",
      answerPdf: "uploadApp/assignment-sets/answer",
    },
    isPdfField: (field) => field === "questionPdf" || field === "answerPdf",
    wideImageFields: ["banners"],
  }),
});

// ---------- Category Storage ----------
const categoryStorage = new CloudinaryStorage({
  cloudinary,
  params: buildParams({
    folderMap: {
      image: "uploadApp/categories",
    },
    isPdfField: () => false,
    smallImageFields: ["image"],
  }),
});

// ---------- Log Middleware ----------
const logUpload = (req, res, next) => {
  if (req.files) {
    Object.keys(req.files).forEach((key) => {
      req.files[key].forEach((f) => {
        console.log(
          `📤 Upload [${key}]: ${f.originalname} — ${(f.size / 1024).toFixed(
            0
          )} KB`
        );
      });
    });
  }
  next();
};

// =====================================================
//                 MULTER INSTANCES
// =====================================================

// ---------- User Upload ----------
export const userUpload = multer({
  storage: userStorage,
  limits: { fileSize: Math.max(IMAGE_LIMIT, PDF_LIMIT), files: 5 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "pdf" && file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF allowed"), false);
    }
    if (
      (file.fieldname === "photo" || file.fieldname === "avatar") &&
      !file.mimetype.startsWith("image/")
    ) {
      return cb(new Error("Only images allowed"), false);
    }
    cb(null, true);
  },
});

// ---------- Event Upload ----------
export const eventUpload = multer({
  storage: eventStorage,
  limits: { fileSize: Math.max(IMAGE_LIMIT, PDF_LIMIT), files: 5 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "banners" && !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only images allowed for banners"), false);
    }
    if (
      (file.fieldname === "questionPdf" || file.fieldname === "answerPdf") &&
      file.mimetype !== "application/pdf"
    ) {
      return cb(new Error("Only PDF allowed"), false);
    }
    cb(null, true);
  },
});

// ---------- Assignment Upload ----------
export const assignmentUpload = multer({
  storage: assignmentStorage,
  limits: { fileSize: Math.max(IMAGE_LIMIT, PDF_LIMIT), files: 5 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "banners" && !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only images allowed for banners"), false);
    }
    if (
      (file.fieldname === "questionPdf" || file.fieldname === "answerPdf") &&
      file.mimetype !== "application/pdf"
    ) {
      return cb(new Error("Only PDF allowed"), false);
    }
    cb(null, true);
  },
});

// ---------- Category Upload ----------
export const categoryUpload = multer({
  storage: categoryStorage,
  limits: { fileSize: IMAGE_LIMIT, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "image" && !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only images allowed"), false);
    }
    cb(null, true);
  },
});

// ---------- Export log middleware ----------
export { logUpload };

// ---------- Quiz Storage ----------
const quizStorage = new CloudinaryStorage({
  cloudinary,
  params: buildParams({
    folderMap: {
      banner: "uploadApp/quizzes/banners",
    },
    isPdfField: () => false,
    wideImageFields: ["banner"],
  }),
    timeout: 120000,  // ✅ 2 minute

});

// ---------- Quiz Upload ----------
export const quizUpload = multer({
  storage: quizStorage,
  limits: { fileSize: IMAGE_LIMIT, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "banner" && !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only images allowed for banner"), false);
    }
    cb(null, true);
  },
});