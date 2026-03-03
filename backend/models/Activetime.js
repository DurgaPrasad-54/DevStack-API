const mongoose = require("mongoose");

const activeTimeSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
    unique: true
  },
  activeTime: {
    type: Number, // ✅ Change String to Number
    default: 0
  }
});

const ActiveTime = mongoose.model("ActiveTime", activeTimeSchema);
module.exports = ActiveTime;

