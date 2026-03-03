const mongoose = require("mongoose");
const Hackathon = require("../Models/HackathonAdmin"); // Import Hackathon model

const scheduleSchema = new mongoose.Schema(
  {
    hackathon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon", // Reference Hackathon
      required: true,
    },
    hackathonYear: { // Auto-filled from Hackathon.year
      type: String,
      enum: ["first year", "second year", "third year", "fourth year"],
    },
    hackathonCollege: { // Auto-filled from Hackathon.college
      type: String,
      enum: ["KIET", "KIET+", "KIEW"],
    },
    days: [
      {
        day: { type: String, required: true }, // Example: "Day 1"
        sessions: [
          {
            time: { type: String, required: true }, // Example: "10:00 AM"
            session: { type: String, required: true }, // Example: "Inauguration"
          },
        ],
      },
    ],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending", // whole schedule status
    },
  },
  { timestamps: true }
);

// Middleware to auto-fill hackathonYear & hackathonCollege
scheduleSchema.pre("save", async function (next) {
  if (this.hackathon) {
    const hackathon = await Hackathon.findById(this.hackathon);
    if (hackathon) {
      this.hackathonYear = hackathon.year;
      this.hackathonCollege = hackathon.college;
    }
  }
  next();
});

const Schedule =
  mongoose.models.Schedule || mongoose.model("Schedule", scheduleSchema);

module.exports = Schedule;
