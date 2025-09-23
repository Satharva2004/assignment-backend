// middleware/upload.js
import multer from "multer";

// Allowed MIME types for images and common documents
const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/svg+xml",
  "image/heic",
  "image/heif",
];

const DOC_MIME_TYPES = [
  // PDF
  "application/pdf",
  // Word
  "application/msword", // .doc (legacy)
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/rtf",
  "text/rtf",
  // PowerPoint
  "application/vnd.ms-powerpoint", // .ppt (legacy)
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  // Excel/Sheets
  "application/vnd.ms-excel", // .xls (legacy)
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "text/csv", // .csv
  "text/tab-separated-values", // .tsv
  // Text
  "text/plain",
  "text/markdown",
  // OpenDocument formats
  "application/vnd.oasis.opendocument.text", // .odt
  "application/vnd.oasis.opendocument.spreadsheet", // .ods
  "application/vnd.oasis.opendocument.presentation", // .odp
  // WPS (Microsoft Works)
  "application/vnd.ms-works",
  // JSON and HTML
  "application/json",
  "text/html",
];

const ALLOWED_MIME_TYPES = new Set([...IMAGE_MIME_TYPES, ...DOC_MIME_TYPES]);

// Memory storage so we can access file buffers directly (useful for AI parsing)
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
}

// 10 MB per file; limit number of files to prevent abuse
const limits = {
  fileSize: 10 * 1024 * 1024, // 10 MB
  files: 15,
  fields: 50,
};

const upload = multer({ storage, fileFilter, limits });

// Common upload helpers
export const uploadSingle = upload.single("file");
export const uploadArray = upload.array("files", 10);
export const uploadImages = upload.array("images", 10);
export const uploadMixed = upload.fields([
  { name: "files", maxCount: 10 },
  { name: "images", maxCount: 10 },
]);

// Fallback to accept anything under multipart/form-data while still enforcing filters/limits
export const uploadAny = upload.any();

export default upload;
