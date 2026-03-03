const mongoose = require("mongoose");

// ⭐ Schema for student feedback on mentors
const mentorFeedbackSchema = new mongoose.Schema(
  {
    hackathon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
    },
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mentor",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    feedback: {
      type: String,
      trim: true,
      default: "",
      required:true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// ✅ Prevent duplicate feedback from the same student for same mentor & hackathon
mentorFeedbackSchema.index(
  { hackathon: 1, mentor: 1, student: 1 },
  { unique: true }
);

module.exports = mongoose.model("MentorFeedback", mentorFeedbackSchema);
