const mongoose = require("mongoose");

const hackGalleryFolderSchema = new mongoose.Schema(
  {
    hackathonName: {
      type: String,
      required: true,
      trim: true,
    },
    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    imageCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const HackGalleryFolder = mongoose.model("HackGalleryFolder", hackGalleryFolderSchema);
module.exports = HackGalleryFolder;
