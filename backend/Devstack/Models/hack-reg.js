const mongoose = require("mongoose");

const hackRegisterSchema = new mongoose.Schema(
  {
    hackathon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
    },
    students: [
      {
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Student",
          required: true,
        },
        transactionId: {
          type: String,
          required: true,
          unique: true,
          trim: true,
        },
        upiUtrNumber: {
          type: String,
          required: true,
          trim: true,
        },
        feeReceiptFileId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
        feeReceiptContentType: {
          type: String,
          required: true,
        },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        registeredAt: {
          type: Date,
          default: Date.now,
        },
        verifiedAt: {
          type: Date,
        },
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Coordinator",
        },
        remarks: {
          type: String,
          trim: true,
        },
      },
    ],
  },
  { 
    timestamps: true, 
    toJSON: { virtuals: true }, 
    toObject: { virtuals: true } 
  }
);

// Index for faster queries
hackRegisterSchema.index({ "students.student": 1, hackathon: 1 });
hackRegisterSchema.index({ "students.status": 1 });

const HackRegister =
  mongoose.models.HackRegister ||
  mongoose.model("HackRegister", hackRegisterSchema);

module.exports = HackRegister;