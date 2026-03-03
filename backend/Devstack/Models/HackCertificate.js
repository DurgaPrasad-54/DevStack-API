const mongoose = require("mongoose");

const hackCertificateSchema = new mongoose.Schema(
  {
    hackathon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
    },
    recipientType: {
      type: String,
      enum: ["student", "mentor"],
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mentor",
      default: null,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackTeam",
      default: null,
    },
    achievementType: {
      type: String,
      enum: ["participant", "champion", "runner-up", "third-place", "mentor"],
      required: true,
    },
    certificateNumber: {
      type: String,
      unique: true,
      required: true,
    },
    recipientName: {
      type: String,
      required: true,
    },
    hackathonName: {
      type: String,
      required: true,
    },
    teamName: {
      type: String,
      default: null,
    },
    technology: {
      type: String,
      default: null,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index to prevent duplicate certificates
hackCertificateSchema.index(
  { hackathon: 1, student: 1, achievementType: 1 },
  { unique: true, partialFilterExpression: { student: { $ne: null } } }
);

hackCertificateSchema.index(
  { hackathon: 1, mentor: 1, achievementType: 1 },
  { unique: true, partialFilterExpression: { mentor: { $ne: null } } }
);

// Index for faster queries
hackCertificateSchema.index({ student: 1 });
hackCertificateSchema.index({ mentor: 1 });
hackCertificateSchema.index({ hackathon: 1 });
hackCertificateSchema.index({ certificateNumber: 1 });

const HackCertificate =
  mongoose.models.HackCertificate ||
  mongoose.model("HackCertificate", hackCertificateSchema);

module.exports = HackCertificate;
