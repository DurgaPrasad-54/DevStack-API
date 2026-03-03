const express = require("express");
const router = express.Router();
const Hackathon = require("../Models/HackathonAdmin");
const HackathonSubmission = require("../Models/hacksubmission");
const HackTeam = require("../Models/hackteam");

// ============================================
// 1. Get all hackathons grouped by year
// ============================================
router.get("/all-hackathons", async (req, res) => {
  try {
    // First try to get completed hackathons, if none exist, get all
    let hackathons = await Hackathon.find({ status: "completed" })
      .select("_id hackathonname year technology college status")
      .sort({ startdate: -1 });

    // If no completed hackathons, get all hackathons for testing/demo
    if (!hackathons || hackathons.length === 0) {
      console.warn("No completed hackathons found, fetching all hackathons");
      hackathons = await Hackathon.find({})
        .select("_id hackathonname year technology college status")
        .sort({ startdate: -1 });
    }

    if (!hackathons || hackathons.length === 0) {
      return res.status(200).json({
        success: false,
        message: "No hackathons found",
        hackathonsByYear: {},
      });
    }

    // Group hackathons by year
    const hackathonsByYear = {};
    hackathons.forEach((hackathon) => {
      const year = hackathon.year || "Unknown";
      if (!hackathonsByYear[year]) {
        hackathonsByYear[year] = [];
      }
      hackathonsByYear[year].push({
        _id: hackathon._id,
        hackathonname: hackathon.hackathonname,
        year: hackathon.year,
        technology: hackathon.technology,
        college: hackathon.college,
        status: hackathon.status,
      });
    });

    return res.status(200).json({
      success: true,
      message: "All hackathons fetched successfully",
      hackathonsByYear: hackathonsByYear,
    });
  } catch (error) {
    console.error("Error fetching all hackathons:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching hackathons",
      error: error.message,
    });
  }
});

// ============================================
// 1B. Get all completed hackathons for dropdown (kept for backward compatibility)
// ============================================
router.get("/completed-hackathons", async (req, res) => {
  try {
    const hackathons = await Hackathon.find({
      status: "completed",
    }).select("_id hackathonname year technology college");

    if (!hackathons || hackathons.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No completed hackathons found",
        hackathons: [],
      });
    }

    return res.status(200).json({
      success: true,
      message: "Completed hackathons fetched successfully",
      hackathons: hackathons,
    });
  } catch (error) {
    console.error("Error fetching completed hackathons:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching hackathons",
      error: error.message,
    });
  }
});

// ============================================
// 2. Search hackathons by name (for search bar)
// ============================================
router.get("/search-hackathons", async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    // Search in completed hackathons first
    let hackathons = await Hackathon.find({
      status: "completed",
      hackathonname: { $regex: query, $options: "i" }, // Case-insensitive search
    }).select("_id hackathonname year technology college");

    // If no completed hackathons found, search all hackathons (for testing)
    if (!hackathons || hackathons.length === 0) {
      hackathons = await Hackathon.find({
        hackathonname: { $regex: query, $options: "i" }, // Case-insensitive search
      }).select("_id hackathonname year technology college");
    }

    return res.status(200).json({
      success: true,
      message: "Hackathons found",
      hackathons: hackathons,
    });
  } catch (error) {
    console.error("Error searching hackathons:", error);
    return res.status(500).json({
      success: false,
      message: "Error searching hackathons",
      error: error.message,
    });
  }
});

// ============================================
// 3. Get top 3 teams by score for a hackathon
// ============================================
router.get("/top-teams/:hackathonId", async (req, res) => {
  try {
    const { hackathonId } = req.params;

    // Verify hackathon exists
    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({
        success: false,
        message: "Hackathon not found",
      });
    }

    // Get top 3 submissions by score
    const submissions = await HackathonSubmission.find({
      hackathon: hackathonId,
    })
      .populate({
        path: "team",
        select: "name",
        populate: {
          path: "students",
          select: "student",
          populate: {
            path: "student",
            select: "name email",
          },
        },
      })
      .populate({
        path: "teamLead",
        populate: {
          path: "student",
          select: "name email",
        },
      })
      .sort({ score: -1 })
      .limit(3);

    // Return success even if no submissions (will show "No Winners Yet" message)
    if (!submissions || submissions.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No submissions found for this hackathon",
        topTeams: [],
      });
    }

    // Format the response with rank
    const topTeams = submissions.map((submission, index) => ({
      rank: index + 1,
      teamId: submission.team._id,
      teamName: submission.team.name,
      evaluationScore: submission.score,
      projectDescription: submission.projectDescription,
      githubRepo: submission.githubRepo,
      liveDemoLink: submission.liveDemoLink,
      teamMembers: submission.team.students.map((member) => ({
        studentId: member.student._id,
        name: member.student.name,
        email: member.student.email,
      })),
      teamLead: {
        studentId: submission.teamLead?.student?._id || null,
        name: submission.teamLead?.student?.name || "N/A",
        email: submission.teamLead?.student?.email || "N/A",
      },
    }));

    return res.status(200).json({
      success: true,
      message: "Top 3 teams fetched successfully",
      hackathonName: hackathon.hackathonname,
      hackathonYear: hackathon.year,
      hackathonTechnology: hackathon.technology,
      topTeams: topTeams,
    });
  } catch (error) {
    console.error("Error fetching top teams:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching top teams",
      error: error.message,
    });
  }
});

// ============================================
// 4. Get winner details (including prize info)
// ============================================
router.get("/:hackathonId/details", async (req, res) => {
  try {
    const { hackathonId } = req.params;

    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({
        success: false,
        message: "Hackathon not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Hackathon details fetched",
      details: {
        hackathonName: hackathon.hackathonname,
        year: hackathon.year,
        technology: hackathon.technology,
        college: hackathon.college,
        firstPrize: hackathon.firstprize,
        secondPrize: hackathon.secondprize,
        thirdPrize: hackathon.thirdprize,
        startDate: hackathon.startdate,
        endDate: hackathon.enddate,
        location: hackathon.location,
      },
    });
  } catch (error) {
    console.error("Error fetching hackathon details:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching hackathon details",
      error: error.message,
    });
  }
});

module.exports = router;
