const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const HackCertificate = require("../Models/HackCertificate");
const Hackathon = require("../Models/HackathonAdmin");
const HackTeam = require("../Models/hackteam");
const HackMentor = require("../Models/Hackmentor");
const HackRegister = require("../Models/hack-reg");
const HackathonSubmission = require("../Models/hacksubmission");

// ============================================
// Helper function to generate unique certificate number
// Uses timestamp + counter + random string for guaranteed uniqueness
// ============================================
let certCounter = 0;
const generateCertificateNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const counter = (++certCounter).toString(36).toUpperCase().padStart(4, '0');
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `HACK-CERT-${timestamp}-${counter}-${random}`;
};

// ============================================
// Certificate Generation Service
// Handles all certificate creation logic with proper async handling
// ============================================
const CertificateService = {
  /**
   * Helper function to get student info from registration subdoc ID
   * @param {Object} hackReg - The HackRegister document (populated with students.student)
   * @param {String|ObjectId} regId - The registration subdocument ID
   * @returns {Object|null} Student info object or null
   */
  getStudentFromRegId(hackReg, regId) {
    if (!hackReg || !hackReg.students) return null;
    
    // Find the registration entry by subdocument ID
    const regEntry = hackReg.students.find(
      (s) => s._id.toString() === regId.toString()
    );
    
    if (!regEntry || !regEntry.student) return null;
    
    // Only return approved students
    if (regEntry.status !== "approved") return null;
    
    return {
      _id: regEntry.student._id,
      name: regEntry.student.name || "Unknown",
      email: regEntry.student.email,
    };
  },

  /**
   * Build certificates array for all participants and mentors
   * Uses for...of loops for proper async handling (NOT forEach)
   * @param {Object} hackathon - The hackathon document
   * @returns {Promise<Array>} Array of certificate objects ready for insertion
   */
  async buildCertificates(hackathon) {
    const hackathonId = hackathon._id;
    const certificates = [];
    const processedStudentIds = new Set(); // Track processed students to avoid duplicates

    console.log("=== Starting certificate generation for:", hackathon.hackathonname, "===");

    // Step 1: Get the HackRegister document for this hackathon (contains all registered students)
    const hackReg = await HackRegister.findOne({ hackathon: hackathonId })
      .populate("students.student", "name email _id")
      .lean();

    if (!hackReg) {
      console.log("WARNING: No HackRegister found for hackathon:", hackathonId);
    } else {
      console.log("HackRegister found with", hackReg.students?.length || 0, "student registrations");
      // Log each registered student
      if (hackReg.students) {
        hackReg.students.forEach((reg, i) => {
          console.log(`  - Reg[${i}]: ID=${reg._id}, Student=${reg.student?.name || 'N/A'}, Status=${reg.status}`);
        });
      }
    }

    // Step 2: Get top 3 teams by score from submissions
    const topSubmissions = await HackathonSubmission.find({ hackathon: hackathonId })
      .populate("team", "name students teamLead")
      .sort({ score: -1 })
      .limit(3)
      .lean();

    console.log("Top submissions found:", topSubmissions.length);

    // Map rank to achievement type
    const rankToAchievement = {
      0: "champion",
      1: "runner-up", 
      2: "third-place",
    };

    // Set of top team IDs for later exclusion
    const topTeamIds = new Set();

    // Step 3: Generate certificates for top 3 teams using for...of (proper async)
    for (let rank = 0; rank < topSubmissions.length; rank++) {
      const submission = topSubmissions[rank];
      if (!submission.team) continue;

      const team = submission.team;
      topTeamIds.add(team._id.toString());
      const achievementType = rankToAchievement[rank];

      console.log(`Processing team "${team.name}" (rank ${rank + 1}, ${achievementType})`);
      console.log(`  TeamLead regId: ${team.teamLead}`);
      console.log(`  Students array: ${JSON.stringify(team.students)}`);

      // Process team lead first (teamLead is a registration subdoc ID)
      if (team.teamLead && hackReg) {
        const student = this.getStudentFromRegId(hackReg, team.teamLead);
        console.log(`  TeamLead lookup result:`, student ? student.name : 'NOT FOUND');
        if (student && !processedStudentIds.has(student._id.toString())) {
          processedStudentIds.add(student._id.toString());
          certificates.push({
            hackathon: hackathonId,
            recipientType: "student",
            student: student._id,
            team: team._id,
            achievementType: achievementType,
            certificateNumber: generateCertificateNumber(),
            recipientName: student.name,
            hackathonName: hackathon.hackathonname,
            teamName: team.name,
            technology: hackathon.technology,
            issuedAt: new Date(),
          });
          console.log(`  ✓ Added certificate for team lead: ${student.name}`);
        }
      }

      // Process team members (students array contains registration subdoc IDs)
      if (team.students && Array.isArray(team.students) && hackReg) {
        console.log(`  Processing ${team.students.length} team members...`);
        for (const regId of team.students) {
          console.log(`    Checking regId: ${regId}`);
          const member = this.getStudentFromRegId(hackReg, regId);
          console.log(`    Student lookup result:`, member ? member.name : 'NOT FOUND');
          if (!member) continue;
          
          const memberIdStr = member._id.toString();
          if (processedStudentIds.has(memberIdStr)) {
            console.log(`    (Already processed, skipping)`);
            continue;
          }
          processedStudentIds.add(memberIdStr);

          certificates.push({
            hackathon: hackathonId,
            recipientType: "student",
            student: member._id,
            team: team._id,
            achievementType: achievementType,
            certificateNumber: generateCertificateNumber(),
            recipientName: member.name,
            hackathonName: hackathon.hackathonname,
            teamName: team.name,
            technology: hackathon.technology,
            issuedAt: new Date(),
          });
          console.log(`    ✓ Added certificate for member: ${member.name}`);
        }
      }
    }

    // Step 4: Get ALL teams in this hackathon for participation certificates
    const allTeams = await HackTeam.find({ hackathon: hackathonId })
      .select("name students teamLead")
      .lean();

    console.log("All teams in hackathon:", allTeams.length);
    allTeams.forEach((t, i) => {
      console.log(`  - Team[${i}]: ${t.name}, Students: ${t.students?.length || 0}, TeamLead: ${t.teamLead || 'N/A'}`);
    });

    // Step 5: Generate participation certificates for non-top-3 teams (only those who submitted)
    // Get all teams that have submitted
    const submittedTeamIds = new Set();
    const allSubmissions = await HackathonSubmission.find({ hackathon: hackathonId })
      .select("team")
      .lean();
    
    console.log("All submissions:", allSubmissions.length);

    for (const sub of allSubmissions) {
      if (sub.team) {
        submittedTeamIds.add(sub.team.toString());
      }
    }

    for (const team of allTeams) {
      // Skip if this team is already in top 3
      if (topTeamIds.has(team._id.toString())) continue;
      
      // Skip if team did NOT submit their project (no participation certificate for non-submitters)
      if (!submittedTeamIds.has(team._id.toString())) continue;

      // Process team lead
      if (team.teamLead && hackReg) {
        const student = this.getStudentFromRegId(hackReg, team.teamLead);
        if (student && !processedStudentIds.has(student._id.toString())) {
          processedStudentIds.add(student._id.toString());
          certificates.push({
            hackathon: hackathonId,
            recipientType: "student",
            student: student._id,
            team: team._id,
            achievementType: "participant",
            certificateNumber: generateCertificateNumber(),
            recipientName: student.name,
            hackathonName: hackathon.hackathonname,
            teamName: team.name,
            technology: hackathon.technology,
            issuedAt: new Date(),
          });
        }
      }

      // Process team members
      if (team.students && Array.isArray(team.students) && hackReg) {
        for (const regId of team.students) {
          const student = this.getStudentFromRegId(hackReg, regId);
          if (!student) continue;
          
          const studentIdStr = student._id.toString();
          if (processedStudentIds.has(studentIdStr)) continue;
          processedStudentIds.add(studentIdStr);

          certificates.push({
            hackathon: hackathonId,
            recipientType: "student",
            student: student._id,
            team: team._id,
            achievementType: "participant",
            certificateNumber: generateCertificateNumber(),
            recipientName: student.name,
            hackathonName: hackathon.hackathonname,
            teamName: team.name,
            technology: hackathon.technology,
            issuedAt: new Date(),
          });
        }
      }
    }

    // Step 6: Get ALL approved mentors for this hackathon
    const hackMentorDoc = await HackMentor.findOne({ hackathon: hackathonId })
      .populate("mentors.mentor", "name email _id")
      .lean();

    const processedMentorIds = new Set();

    if (hackMentorDoc && hackMentorDoc.mentors && Array.isArray(hackMentorDoc.mentors)) {
      for (const mentorReq of hackMentorDoc.mentors) {
        // Only process approved mentors
        if (mentorReq.status !== "approved") continue;
        if (!mentorReq.mentor) continue;

        const mentorIdStr = mentorReq.mentor._id.toString();
        
        // Skip if already processed
        if (processedMentorIds.has(mentorIdStr)) continue;
        processedMentorIds.add(mentorIdStr);

        certificates.push({
          hackathon: hackathonId,
          recipientType: "mentor",
          mentor: mentorReq.mentor._id,
          achievementType: "mentor",
          certificateNumber: generateCertificateNumber(),
          recipientName: mentorReq.mentor.name || "Unknown Mentor",
          hackathonName: hackathon.hackathonname,
          technology: hackathon.technology,
          issuedAt: new Date(),
        });
      }
    }

    console.log(`Certificate generation summary for ${hackathon.hackathonname}:`);
    console.log(`- Students processed: ${processedStudentIds.size}`);
    console.log(`- Mentors processed: ${processedMentorIds.size}`);
    console.log(`- Total certificates: ${certificates.length}`);

    return certificates;
  },

  /**
   * Calculate statistics from certificates array
   * @param {Array} certificates - Array of certificate objects
   * @returns {Object} Statistics object
   */
  calculateStats(certificates) {
    return {
      total: certificates.length,
      champions: certificates.filter((c) => c.achievementType === "champion").length,
      runnersUp: certificates.filter((c) => c.achievementType === "runner-up").length,
      thirdPlace: certificates.filter((c) => c.achievementType === "third-place").length,
      participants: certificates.filter((c) => c.achievementType === "participant").length,
      mentors: certificates.filter((c) => c.achievementType === "mentor").length,
    };
  },
};

// ============================================
// 1. Get all completed hackathons for certificate generation
// ============================================
router.get("/completed-hackathons", async (req, res) => {
  try {
    const hackathons = await Hackathon.find({ status: "completed" })
      .select("_id hackathonname year technology college startdate enddate")
      .sort({ enddate: -1 })
      .lean();

    // Use Promise.all for parallel certificate count queries
    const hackathonsWithStatus = await Promise.all(
      hackathons.map(async (hackathon) => {
        const certificateCount = await HackCertificate.countDocuments({
          hackathon: hackathon._id,
        });
        return {
          ...hackathon,
          certificatesGenerated: certificateCount > 0,
          certificateCount,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Completed hackathons fetched successfully",
      hackathons: hackathonsWithStatus,
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
// DEBUG: Check hackathon data for certificate generation
// ============================================
router.get("/debug/:hackathonId", async (req, res) => {
  try {
    const { hackathonId } = req.params;

    // Get HackRegister with all students
    const hackReg = await HackRegister.findOne({ hackathon: hackathonId })
      .populate("students.student", "name email _id")
      .lean();

    // Get all teams
    const teams = await HackTeam.find({ hackathon: hackathonId })
      .lean();

    // Get all submissions
    const submissions = await HackathonSubmission.find({ hackathon: hackathonId })
      .populate("team", "name")
      .lean();

    // Get mentors
    const mentorDoc = await HackMentor.findOne({ hackathon: hackathonId })
      .populate("mentors.mentor", "name email")
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        hackRegister: {
          exists: !!hackReg,
          studentCount: hackReg?.students?.length || 0,
          students: hackReg?.students?.map(s => ({
            regId: s._id,
            studentId: s.student?._id,
            name: s.student?.name,
            status: s.status
          })) || []
        },
        teams: teams.map(t => ({
          id: t._id,
          name: t.name,
          teamLead: t.teamLead,
          students: t.students,
          studentCount: t.students?.length || 0
        })),
        submissions: submissions.map(s => ({
          id: s._id,
          teamId: s.team?._id,
          teamName: s.team?.name,
          score: s.score
        })),
        mentors: {
          exists: !!mentorDoc,
          count: mentorDoc?.mentors?.length || 0,
          list: mentorDoc?.mentors?.map(m => ({
            mentorId: m.mentor?._id,
            name: m.mentor?.name,
            status: m.status
          })) || []
        }
      }
    });
  } catch (error) {
    console.error("Debug error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 2. Generate certificates for a hackathon
// POST /generate/:hackathonId
// This generates certificates for ALL registered students and mentors
// CRITICAL: Only ONE response is sent after ALL certificates are generated
// ============================================
router.post("/generate/:hackathonId", async (req, res) => {
  try {
    const { hackathonId } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(hackathonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hackathon ID format",
      });
    }

    // Step 1: Validate hackathon exists
    const hackathon = await Hackathon.findById(hackathonId).lean();
    if (!hackathon) {
      return res.status(404).json({
        success: false,
        message: "Hackathon not found",
      });
    }

    // Step 2: Check if hackathon is completed
    if (hackathon.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot generate certificates for non-completed hackathon. Current status: " + hackathon.status,
      });
    }

    // Step 3: Check if certificates already exist (prevent duplicates)
    const existingCerts = await HackCertificate.countDocuments({
      hackathon: hackathonId,
    });
    
    if (existingCerts > 0) {
      return res.status(400).json({
        success: false,
        message: `Certificates already generated for this hackathon (${existingCerts} certificates exist). Delete existing certificates first to regenerate.`,
      });
    }

    // Step 4: Build all certificates using the service
    // This collects ALL students and mentors before inserting
    const certificates = await CertificateService.buildCertificates(hackathon);

    // Step 5: Check if any certificates were generated
    if (certificates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No participants or mentors found for this hackathon. Please ensure teams and mentors are registered.",
      });
    }

    // Step 6: Insert all certificates in a single batch operation
    // Use ordered: false so it continues even if some fail (e.g., duplicates)
    let insertedCount = 0;
    let errorCount = 0;
    
    try {
      const result = await HackCertificate.insertMany(certificates, { ordered: false });
      insertedCount = result.length;
      console.log(`InsertMany SUCCESS: ${result.length} certificates inserted`);
    } catch (bulkError) {
      // With ordered: false, MongoDB throws error but still inserts valid documents
      console.log("InsertMany PARTIAL ERROR:", bulkError.message);
      if (bulkError.insertedDocs) {
        insertedCount = bulkError.insertedDocs.length;
      } else if (bulkError.result && bulkError.result.nInserted) {
        insertedCount = bulkError.result.nInserted;
      }
      if (bulkError.writeErrors) {
        errorCount = bulkError.writeErrors.length;
        console.log("Write errors:", bulkError.writeErrors.map(e => e.errmsg));
      }
      console.log(`Bulk insert result: ${insertedCount} inserted, ${errorCount} errors`);
    }

    // Verify actual count in database
    const actualCount = await HackCertificate.countDocuments({ hackathon: hackathonId });
    console.log(`Actual certificates in DB for this hackathon: ${actualCount}`);

    // Step 7: Calculate and return statistics based on actual DB count
    const stats = CertificateService.calculateStats(certificates);
    stats.inserted = actualCount; // Use actual DB count
    stats.errors = errorCount;

    // IMPORTANT: Single response after ALL operations complete successfully
    // No response is sent inside any loop
    return res.status(201).json({
      success: true,
      message: `Successfully generated ${actualCount} certificates for ${hackathon.hackathonname}${errorCount > 0 ? ` (${errorCount} duplicates skipped)` : ''}`,
      stats: stats,
    });

  } catch (error) {
    console.error("Error generating certificates:", error);
    
    return res.status(500).json({
      success: false,
      message: "Error generating certificates: " + error.message,
      error: error.message,
    });
  }
});

// ============================================
// 3. Get certificates for a hackathon (admin view)
// ============================================
router.get("/hackathon/:hackathonId", async (req, res) => {
  try {
    const { hackathonId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(hackathonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hackathon ID format",
      });
    }

    const certificates = await HackCertificate.find({ hackathon: hackathonId })
      .populate("student", "name email")
      .populate("mentor", "name email")
      .populate("team", "name")
      .populate("hackathon", "hackathonname")
      .sort({ achievementType: 1, recipientName: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Certificates fetched successfully",
      certificates,
      count: certificates.length,
    });
  } catch (error) {
    console.error("Error fetching certificates:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching certificates",
      error: error.message,
    });
  }
});

// ============================================
// 4. Get certificates for a student
// ============================================
router.get("/student/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid student ID format",
      });
    }

    const certificates = await HackCertificate.find({
      student: studentId,
      recipientType: "student",
    })
      .populate("hackathon", "hackathonname technology year startdate enddate")
      .populate("team", "name")
      .sort({ issuedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Student certificates fetched successfully",
      certificates,
      count: certificates.length,
    });
  } catch (error) {
    console.error("Error fetching student certificates:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching certificates",
      error: error.message,
    });
  }
});

// ============================================
// 5. Get certificates for a mentor
// ============================================
router.get("/mentor/:mentorId", async (req, res) => {
  try {
    const { mentorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(mentorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid mentor ID format",
      });
    }

    const certificates = await HackCertificate.find({
      mentor: mentorId,
      recipientType: "mentor",
    })
      .populate("hackathon", "hackathonname technology year startdate enddate")
      .sort({ issuedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Mentor certificates fetched successfully",
      certificates,
      count: certificates.length,
    });
  } catch (error) {
    console.error("Error fetching mentor certificates:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching certificates",
      error: error.message,
    });
  }
});

// ============================================
// 6. Get single certificate by ID
// ============================================
router.get("/single/:certificateId", async (req, res) => {
  try {
    const { certificateId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(certificateId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid certificate ID format",
      });
    }

    const certificate = await HackCertificate.findById(certificateId)
      .populate("hackathon", "hackathonname technology year startdate enddate")
      .populate("student", "name email")
      .populate("mentor", "name email")
      .populate("team", "name")
      .lean();

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Certificate fetched successfully",
      certificate,
    });
  } catch (error) {
    console.error("Error fetching certificate:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching certificate",
      error: error.message,
    });
  }
});

// ============================================
// 7. Verify certificate by certificate number
// ============================================
router.get("/verify/:certificateNumber", async (req, res) => {
  try {
    const { certificateNumber } = req.params;

    const certificate = await HackCertificate.findOne({ certificateNumber })
      .populate("hackathon", "hackathonname technology year startdate enddate")
      .populate("student", "name email")
      .populate("mentor", "name email")
      .populate("team", "name")
      .lean();

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found or invalid certificate number",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Certificate verified successfully",
      certificate,
      isValid: true,
    });
  } catch (error) {
    console.error("Error verifying certificate:", error);
    return res.status(500).json({
      success: false,
      message: "Error verifying certificate",
      error: error.message,
    });
  }
});

// ============================================
// 8. Delete all certificates for a hackathon (for regeneration)
// ============================================
router.delete("/hackathon/:hackathonId", async (req, res) => {
  try {
    const { hackathonId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(hackathonId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hackathon ID format",
      });
    }

    const result = await HackCertificate.deleteMany({ hackathon: hackathonId });

    return res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} certificates`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting certificates:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting certificates",
      error: error.message,
    });
  }
});

module.exports = router;
