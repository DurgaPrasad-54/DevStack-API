const mongoose = require("mongoose");

const problemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  technologies: [{ type: String }],
  isSelected: { type: Boolean, default: false },
  selectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "HackTeams",
    default: null
  }
});

const problemStatementSchema = new mongoose.Schema({
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: "Mentor", required: true },
  hackathon: { type: mongoose.Schema.Types.ObjectId, ref: "Hackathon", required: true },
  hackMentor: { type: mongoose.Schema.Types.ObjectId, ref: "HackMentor" },
  problemStatements: [problemSchema],
});

module.exports = mongoose.model("ProblemStatement", problemStatementSchema);
