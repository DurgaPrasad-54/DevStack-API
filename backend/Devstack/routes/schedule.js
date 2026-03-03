const express = require("express");
const router = express.Router();
const Schedule = require("../Models/schedule"); // Adjust path as needed
const Hackathon = require("../Models/HackathonAdmin"); 
const { Mentor } = require('../../models/roles'); // Adjust path as needed
const mongoose = require("mongoose");

// Utility function to calculate hackathon status
const calculateStatus = (regstart, enddate) => {
  const now = new Date();
  const regStart = new Date(regstart);
  const endDate = new Date(enddate);
  
  if (now < regStart) return 'upcoming';
  if (now >= regStart && now <= endDate) return 'active';
  return 'completed';
};

// FETCH HELPERS - Get mentors and hackathons for forms
router.get('/mentors', async (req, res) => {
  try {
    const mentors = await Mentor.find({ status: 'approved' }, 'name _id email');
    res.json({
      success: true,
      data: mentors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching mentors',
      error: error.message
    });
  }
});

router.get('/hackathons', async (req, res) => {
  try {
    // Send hackathonname instead of name
    const hackathons = await Hackathon.find({}, 'hackathonname _id year college');
    res.json({
      success: true,
      data: hackathons
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching hackathons',
      error: error.message
    });
  }
});

// CREATE - Add new schedule
router.post("/", async (req, res) => {
  try {
    const { hackathon, days } = req.body;

    // Validate required fields
    if (!hackathon || !days || days.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Hackathon ID and days are required",
      });
    }

    // Prevent duplicate schedule for same hackathon
    const existingSchedule = await Schedule.findOne({ hackathon });
    if (existingSchedule) {
      return res.status(409).json({
        success: false,
        message: "A schedule already exists for this hackathon.",
      });
    }

    // Validate hackathon exists and get hackathonYear
    const hackathonDoc = await Hackathon.findById(hackathon);
    if (!hackathonDoc) {
      return res.status(404).json({
        success: false,
        message: "Hackathon not found",
      });
    }

    // Create new schedule with auto-filled hackathonYear
    const newSchedule = new Schedule({
      hackathon,
      hackathonYear: hackathonDoc.year, // Auto-fill from Hackathon
      days,
      status: req.body.status || "pending",
    });

    const savedSchedule = await newSchedule.save();

    // Populate hackathon details
    await savedSchedule.populate("hackathon");

    res.status(201).json({
      success: true,
      message: "Schedule created successfully",
      data: savedSchedule,
    });
  } catch (error) {
    console.error("Error creating schedule:", error);
    res.status(500).json({
      success: false,
      message: "Error creating schedule",
      error: error.message,
    });
  }
});

// READ - Get all schedules
router.get("/", async (req, res) => {
  try {
    const { status, hackathonYear, hackathon, page = 1, limit = 10 } = req.query;

    // Build filter object
    const filter = {};
    if (status) filter.status = status;
    if (hackathonYear) filter.hackathonYear = hackathonYear;
    if (hackathon) filter.hackathon = hackathon;

    // Calculate pagination
    const skip = (page - 1) * limit;

    const schedules = await Schedule.find(filter)
      .populate("hackathon")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Schedule.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: schedules,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: schedules.length,
        totalRecords: total,
      },
    });
  } catch (error) {
    console.error("Error fetching schedules:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching schedules",
      error: error.message,
    });
  }
});

// READ - Get approved schedules
router.get("/approved", async (req, res) => {
  try {
    const schedules = await Schedule.find({ status: "approved" }).populate("hackathon").sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: schedules,
    });
  } catch (error) {
    console.error("Error fetching approved schedules:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching approved schedules",
      error: error.message,
    });
  }
});

// READ - Get schedule by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule ID",
      });
    }

    const schedule = await Schedule.findById(id).populate("hackathon");

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    res.status(200).json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    console.error("Error fetching schedule:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching schedule",
      error: error.message,
    });
  }
});

// READ - Get schedules by hackathon ID
router.get("/hackathon/:hackathonId", async (req, res) => {
  try {
    const { hackathonId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(hackathonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hackathon ID",
      });
    }

    const schedules = await Schedule.find({ hackathon: hackathonId })
      .populate("hackathon")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: schedules,
      count: schedules.length,
    });
  } catch (error) {
    console.error("Error fetching schedules by hackathon:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching schedules by hackathon",
      error: error.message,
    });
  }
});

// UPDATE - Update schedule by ID
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { hackathon, days, status } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule ID",
      });
    }

    // Check if schedule exists
    const existingSchedule = await Schedule.findById(id);
    if (!existingSchedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    // Prepare update object
    const updateData = {};
    
    // If hackathon is being updated, validate and get new hackathonYear
    if (hackathon) {
      const hackathonDoc = await Hackathon.findById(hackathon);
      if (!hackathonDoc) {
        return res.status(404).json({
          success: false,
          message: "Hackathon not found",
        });
      }
      updateData.hackathon = hackathon;
      updateData.hackathonYear = hackathonDoc.year;
    }

    if (days) updateData.days = days;
    if (status) updateData.status = status;

    const updatedSchedule = await Schedule.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    ).populate("hackathon");

    res.status(200).json({
      success: true,
      message: "Schedule updated successfully",
      data: updatedSchedule,
    });
  } catch (error) {
    console.error("Error updating schedule:", error);
    res.status(500).json({
      success: false,
      message: "Error updating schedule",
      error: error.message,
    });
  }
});

// UPDATE - Update schedule status only
router.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule ID",
      });
    }

    // Validate status
    if (!status || !["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'pending', 'approved', or 'rejected'",
      });
    }

    const updatedSchedule = await Schedule.findByIdAndUpdate(
      id,
      { status },
      {
        new: true,
        runValidators: true,
      }
    ).populate("hackathon");

    if (!updatedSchedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Schedule status updated successfully",
      data: updatedSchedule,
    });
  } catch (error) {
    console.error("Error updating schedule status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating schedule status",
      error: error.message,
    });
  }
});

// ========== DAYS CRUD OPERATIONS ==========

// CREATE - Add new day to schedule
router.post("/:id/days", async (req, res) => {
  try {
    const { id } = req.params;
    const { day, sessions = [] } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule ID",
      });
    }

    // Validate required fields
    if (!day) {
      return res.status(400).json({
        success: false,
        message: "Day name is required",
      });
    }

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    // Add new day
    const newDay = { day, sessions };
    schedule.days.push(newDay);
    const updatedSchedule = await schedule.save();
    await updatedSchedule.populate("hackathon");

    res.status(201).json({
      success: true,
      message: "Day added successfully",
      data: updatedSchedule,
      newDay: schedule.days[schedule.days.length - 1], // Return the newly added day
    });
  } catch (error) {
    console.error("Error adding day:", error);
    res.status(500).json({
      success: false,
      message: "Error adding day",
      error: error.message,
    });
  }
});

// READ - Get specific day from schedule
router.get("/:id/days/:dayIndex", async (req, res) => {
  try {
    const { id, dayIndex } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule ID",
      });
    }

    const schedule = await Schedule.findById(id).populate("hackathon");
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    // Validate day index
    if (dayIndex < 0 || dayIndex >= schedule.days.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid day index",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        schedule: schedule,
        day: schedule.days[dayIndex],
        dayIndex: parseInt(dayIndex)
      },
    });
  } catch (error) {
    console.error("Error fetching day:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching day",
      error: error.message,
    });
  }
});

// UPDATE - Update specific day
router.put("/:id/days/:dayIndex", async (req, res) => {
  try {
    const { id, dayIndex } = req.params;
    const { day, sessions } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule ID",
      });
    }

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    // Validate day index
    if (dayIndex < 0 || dayIndex >= schedule.days.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid day index",
      });
    }

    // Update day
    if (day) schedule.days[dayIndex].day = day;
    if (sessions) schedule.days[dayIndex].sessions = sessions;

    const updatedSchedule = await schedule.save();
    await updatedSchedule.populate("hackathon");

    res.status(200).json({
      success: true,
      message: "Day updated successfully",
      data: updatedSchedule,
      updatedDay: schedule.days[dayIndex],
    });
  } catch (error) {
    console.error("Error updating day:", error);
    res.status(500).json({
      success: false,
      message: "Error updating day",
      error: error.message,
    });
  }
});

// DELETE - Remove specific day
router.delete("/:id/days/:dayIndex", async (req, res) => {
  try {
    const { id, dayIndex } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule ID",
      });
    }

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    // Validate day index
    if (dayIndex < 0 || dayIndex >= schedule.days.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid day index",
      });
    }

    // Remove day
    const removedDay = schedule.days[dayIndex];
    schedule.days.splice(dayIndex, 1);
    const updatedSchedule = await schedule.save();
    await updatedSchedule.populate("hackathon");

    res.status(200).json({
      success: true,
      message: "Day removed successfully",
      data: updatedSchedule,
      removedDay: removedDay,
    });
  } catch (error) {
    console.error("Error removing day:", error);
    res.status(500).json({
      success: false,
      message: "Error removing day",
      error: error.message,
    });
  }
});

// ========== SESSIONS CRUD OPERATIONS ==========

// CREATE - Add session to specific day
router.post("/:id/days/:dayIndex/sessions", async (req, res) => {
  try {
    const { id, dayIndex } = req.params;
    const { time, session } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule ID",
      });
    }

    // Validate required fields
    if (!time || !session) {
      return res.status(400).json({
        success: false,
        message: "Time and session are required",
      });
    }

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    // Validate day index
    if (dayIndex < 0 || dayIndex >= schedule.days.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid day index",
      });
    }

    // Add session to specific day
    const newSession = { time, session };
    schedule.days[dayIndex].sessions.push(newSession);
    const updatedSchedule = await schedule.save();
    await updatedSchedule.populate("hackathon");

    res.status(201).json({
      success: true,
      message: "Session added successfully",
      data: updatedSchedule,
      newSession: schedule.days[dayIndex].sessions[schedule.days[dayIndex].sessions.length - 1],
    });
  } catch (error) {
    console.error("Error adding session:", error);
    res.status(500).json({
      success: false,
      message: "Error adding session",
      error: error.message,
    });
  }
});

// READ - Get specific session
router.get("/:id/days/:dayIndex/sessions/:sessionIndex", async (req, res) => {
  try {
    const { id, dayIndex, sessionIndex } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule ID",
      });
    }

    const schedule = await Schedule.findById(id).populate("hackathon");
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    // Validate day index
    if (dayIndex < 0 || dayIndex >= schedule.days.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid day index",
      });
    }

    // Validate session index
    if (sessionIndex < 0 || sessionIndex >= schedule.days[dayIndex].sessions.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid session index",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        schedule: schedule,
        day: schedule.days[dayIndex],
        session: schedule.days[dayIndex].sessions[sessionIndex],
        dayIndex: parseInt(dayIndex),
        sessionIndex: parseInt(sessionIndex)
      },
    });
  } catch (error) {
    console.error("Error fetching session:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching session",
      error: error.message,
    });
  }
});

// UPDATE - Update specific session
router.put("/:id/days/:dayIndex/sessions/:sessionIndex", async (req, res) => {
  try {
    const { id, dayIndex, sessionIndex } = req.params;
    const { time, session } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule ID",
      });
    }

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    // Validate day index
    if (dayIndex < 0 || dayIndex >= schedule.days.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid day index",
      });
    }

    // Validate session index
    if (sessionIndex < 0 || sessionIndex >= schedule.days[dayIndex].sessions.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid session index",
      });
    }

    // Update session
    if (time) schedule.days[dayIndex].sessions[sessionIndex].time = time;
    if (session) schedule.days[dayIndex].sessions[sessionIndex].session = session;

    const updatedSchedule = await schedule.save();
    await updatedSchedule.populate("hackathon");

    res.status(200).json({
      success: true,
      message: "Session updated successfully",
      data: updatedSchedule,
      updatedSession: schedule.days[dayIndex].sessions[sessionIndex],
    });
  } catch (error) {
    console.error("Error updating session:", error);
    res.status(500).json({
      success: false,
      message: "Error updating session",
      error: error.message,
    });
  }
});

// DELETE - Remove specific session
router.delete("/:id/days/:dayIndex/sessions/:sessionIndex", async (req, res) => {
  try {
    const { id, dayIndex, sessionIndex } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule ID",
      });
    }

    const schedule = await Schedule.findById(id);
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    // Validate day index
    if (dayIndex < 0 || dayIndex >= schedule.days.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid day index",
      });
    }

    // Validate session index
    if (sessionIndex < 0 || sessionIndex >= schedule.days[dayIndex].sessions.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid session index",
      });
    }

    // Remove session
    const removedSession = schedule.days[dayIndex].sessions[sessionIndex];
    schedule.days[dayIndex].sessions.splice(sessionIndex, 1);
    const updatedSchedule = await schedule.save();
    await updatedSchedule.populate("hackathon");

    res.status(200).json({
      success: true,
      message: "Session removed successfully",
      data: updatedSchedule,
      removedSession: removedSession,
    });
  } catch (error) {
    console.error("Error removing session:", error);
    res.status(500).json({
      success: false,
      message: "Error removing session",
      error: error.message,
    });
  }
});

// DELETE - Delete schedule by ID
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule ID",
      });
    }

    const deletedSchedule = await Schedule.findByIdAndDelete(id);

    if (!deletedSchedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Schedule deleted successfully",
      data: deletedSchedule,
    });
  } catch (error) {
    console.error("Error deleting schedule:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting schedule",
      error: error.message,
    });
  }
});

// DELETE - Delete multiple schedules
router.delete("/", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Array of schedule IDs is required",
      });
    }

    // Validate all IDs
    const invalidIds = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule IDs found",
        invalidIds,
      });
    }

    const result = await Schedule.deleteMany({ _id: { $in: ids } });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} schedule(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting schedules:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting schedules",
      error: error.message,
    });
  }
});

// UTILITY - Get schedule statistics
router.get("/stats/overview", async (req, res) => {
  try {
    const stats = await Schedule.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const yearStats = await Schedule.aggregate([
      {
        $group: {
          _id: "$hackathonYear",
          count: { $sum: 1 },
        },
      },
    ]);

    const totalSchedules = await Schedule.countDocuments();

    res.status(200).json({
      success: true,
      data: {
        total: totalSchedules,
        byStatus: stats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        byYear: yearStats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("Error fetching schedule stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching schedule statistics",
      error: error.message,
    });
  }
});

// Get approved schedules for a single hackathon
router.get("/approved/:hackathonId", async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const schedules = await Schedule.find({ hackathon: hackathonId, status: "approved" })
      .populate("hackathon")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: schedules,
    });
  } catch (error) {
    console.error("Error fetching approved schedules for hackathon:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching approved schedules for hackathon",
      error: error.message,
    });
  }
});

module.exports = router;