const express = require("express");
const { Student } = require("../models/roles"); // Adjust path if needed
const ActiveTime = require("../models/Activetime"); // Ensure this model exists


const router = express.Router();

// Update or create active time for a student
router.post("/active-time", async (req, res) => {
  try {
    const { studentId, activeTime } = req.body;

    // Check if student exists
    const studentExists = await Student.findById(studentId);
    if (!studentExists) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Find and update or create new record
    const updatedRecord = await ActiveTime.findOneAndUpdate(
      { studentId },
      { $inc: { activeTime } }, // Increment activeTime
      { new: true, upsert: true } // Create if not exists
    );
    console.log(updatedRecord); // For debugging purposes, remove before production

    res.json({ message: "Active time updated", data: updatedRecord });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get active time for a student
// Get all students' active time
router.get("/active-times", async (req, res) => {
    try {
      const activeTimes = await ActiveTime.find().populate("studentId", "name email"); // Populate student details if needed
      res.json({ message: "Active times retrieved", data: activeTimes });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  });
  

module.exports = router;
