const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "exams",
      required: true,
    },
    result: {
      type: Object,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Report = mongoose.model("reports", reportSchema);

module.exports = Report;
