const mongoose = require("mongoose");

const notesSchema = new mongoose.Schema(
  {
    folder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackFolder",
      required: true, // Mentor must select a folder first
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    pdf: {
      data: {
        type: Buffer,
        required: true,
      },
      contentType: {
        type: String,
        enum: ["application/pdf"],
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

const Hacknotes = mongoose.model("HackNotes", notesSchema);
module.exports = Hacknotes;