const mongoose = require("mongoose");

const examSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    totalMarks: {
      type: Number,
      required: true,
    },
    passingMarks: {
      type: Number,
      required: true,
    },
    questions: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'questions',
      required: true,
    },
    attemptedBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'users',
      default: [],
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    currentYear: {
      type: String,
      required: true,
      enum: ['first year', 'second year', 'third year', 'fourth year', 'alumni']
    },
  },
  {
    timestamps: true,
  }
);

const Exam = mongoose.model("exams", examSchema);
module.exports = Exam;
