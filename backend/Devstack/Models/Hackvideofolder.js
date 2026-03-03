const mongoose = require("mongoose");

const videoFolderSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnail: {
      data: {
        type: Buffer,
        required: true,
      },
      contentType: {
        type: String,
        enum: ["image/jpeg", "image/png", "image/gif", "image/webp"],
        required: true,
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mentor",
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Use const for model declaration
const Hackvideofolder = mongoose.model("HackVideoFolder", videoFolderSchema);
module.exports = Hackvideofolder;