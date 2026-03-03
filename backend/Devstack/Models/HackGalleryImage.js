const mongoose = require("mongoose");

const hackGalleryImageSchema = new mongoose.Schema(
  {
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackGalleryFolder",
      required: true,
    },
    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    imageFileId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const HackGalleryImage = mongoose.model("HackGalleryImage", hackGalleryImageSchema);
module.exports = HackGalleryImage;
