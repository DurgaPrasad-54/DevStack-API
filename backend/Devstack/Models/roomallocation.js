const mongoose = require("mongoose");

const roomAllocationSchema = new mongoose.Schema({
  hackathon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hackathon",
    required: true,
  },
  hackathonYear: {
    type: String,
    enum: ["first year", "second year", "third year", "fourth year"],
  },
  campusName: { type: String, required: true, trim: true },
  branch: { type: String, required: true, trim: true },
  mentor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Mentor",
    required: true,
  },
  roomNumber: { type: String, required: true, trim: true },
});

// 🔄 Auto-fill year from Hackathon
roomAllocationSchema.pre("save", async function (next) {
  if (this.hackathon && !this.hackathonYear) {
    const Hackathon = mongoose.model("Hackathon");
    const hackathonDoc = await Hackathon.findById(this.hackathon).select("year");
    if (hackathonDoc) {
      this.hackathonYear = hackathonDoc.year;
    }
  }
  next();
});

const roomAllocationBatchSchema = new mongoose.Schema(
  {
    allocations: [roomAllocationSchema],
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    rejectionReason: { type: String, default: null },
    submittedBy: { type: String, trim: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const RoomAllocationBatch =
  mongoose.models.RoomAllocationBatch ||
  mongoose.model("RoomAllocationBatch", roomAllocationBatchSchema);

module.exports = RoomAllocationBatch;
