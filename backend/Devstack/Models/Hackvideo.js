const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    folder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackVideoFolder",
      required: true, // Mentor must select a folder
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    videoLink: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          // allow empty or valid YouTube/URL
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: "Invalid video link URL",
      },
    },
    videoFile: {
      data: Buffer, // if Mentor uploads a file
      contentType: {
        type: String,
        enum: ["video/mp4", "video/webm", "video/ogg"],
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

Hackvideo = mongoose.model("HackVideo", videoSchema);
module.exports = Hackvideo;
