  const mongoose = require("mongoose");

  const mentorRequestSchema = new mongoose.Schema(
    {
      mentor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Mentor",
        required: true,
      },
      status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending",
        required: true,
      },
      requestedAt: {
        type: Date,
        default: Date.now,
      },
      approvedAt: {
        type: Date,
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin", 
      },
      assignto:{
        type: String,
        enum: [
          'Artificial Intelligence (AI)',
          'Artificial Intelligence and Machine Learning (CSM)',
          'Artificial Intelligence and Data Science (AID)',
          'Cyber Security (CSC)',
          'Data Science (CSD)'
        ]
      },
      assignedby:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Coordinator"

      },
    },
    { _id: true } // ensure each mentor request has its own id
  );

  const hackMentorSchema = new mongoose.Schema(
    {
      hackathon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Hackathon",
        required: true,
      },
      mentors: [mentorRequestSchema],
    },
    { timestamps: true }
  );

  const HackMentor =
    mongoose.models.HackMentor || mongoose.model("HackMentor", hackMentorSchema);
  module.exports = HackMentor;
