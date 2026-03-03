const multer = require("multer");

// Use memory storage instead of disk storage
const storage = multer.memoryStorage();

// Only allow images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({ storage, fileFilter });

// No changes needed here, usage is now with upload.fields() in routes

module.exports = upload;
