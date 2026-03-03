const mongoose = require("mongoose");

// 🧩 Subschema for individual member contributions
const contributionSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  contribution: {
    type: String,
    required: true, // description of what the student did
    trim: true,
  },
});

// 🧾 Subschema for project-related document uploads
const documentSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  fileType: { type: String },
  data: { type: Buffer, required: true }, // actual file content
  uploadedAt: { type: Date, default: Date.now },

});

// 📦 Main schema
const hackathonSubmissionSchema = new mongoose.Schema(
  {
    hackathon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
    },

    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackTeam",
      required: true,
    },

    problemStatement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProblemStatement",
      required: true, // parent document id
    },

    // store the selected subdocument id (problem statement sub-id)
    problemSubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProblemStatement", // subdoc id (cannot populate automatically)
      required: true,
    },

    // ✅ Include the team lead and their contribution separately
    teamLead: {
      student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true,
      },
      contribution: {
        type: String,
        required: true,
        trim: true,

      },
    },

    // ✅ Dynamic team members & their contributions
    teamMembers: [contributionSchema],

    // ✅ Core project info
    projectDescription: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 2000,
    },

    githubRepo: {
      type: String,
      trim: true,
      require: true,
    },

    liveDemoLink: {
      type: String,
      trim: true,
    },
    score:{
      type: Number,
      default:0
    },

    documents: {
      type:[documentSchema],
    require:true}, // uploaded documents (ppt, report, etc.)
    
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackRegister", // registration reference
      required: true,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// 🚫 Prevent duplicate submission for same team & problem in a hackathon
hackathonSubmissionSchema.index(
  { hackathon: 1, team: 1, problemSubId: 1 },
  { unique: true }
);

const HackathonSubmission =
  mongoose.models.HackathonSubmission ||
  mongoose.model("HackathonSubmission", hackathonSubmissionSchema);

module.exports = HackathonSubmission;
