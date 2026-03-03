const express = require("express");
const router = express.Router();
const HackRegister = require("../Models/hack-reg");
const Hackathon = require("../Models/HackathonAdmin");
const HackTeam = require("../Models/hackteam");
const HackSubmission = require("../Models/hacksubmission");
const TeamProgress = require("../Models/teamprogress");
const Schedule = require("../Models/schedule");
const ProblemStatement = require("../Models/problemstatements");
const { Student } = require("../../models/roles");
const { authenticateToken } = require("../../middleware/auth");
const mongoose = require("mongoose");

/**
 * @route GET /hackathon-history/student/:studentId/completed
 * @desc Get all completed hackathons for a student with full details
 */
router.get("/student/:studentId/completed", authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const studentObjectId = new mongoose.Types.ObjectId(studentId);

    console.log("🔍 Fetching completed hackathon history for student:", studentId);

    // 1️⃣ Find all registrations where student is approved
    const approvedRegs = await HackRegister.find({
      "students.student": studentObjectId,
      "students.status": "approved",
    }).populate({
      path: "hackathon",
      select: "hackathonname entryfee regstart enddate status year college description banner"
    });

    if (!approvedRegs || approvedRegs.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No hackathon history found",
        hackathons: []
      });
    }

    // 2️⃣ Filter only completed hackathons
    const completedHackathons = approvedRegs
      .filter(reg => reg.hackathon && reg.hackathon.status === "completed")
      .map(reg => reg.hackathon);

    if (completedHackathons.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No completed hackathons found",
        hackathons: []
      });
    }

    // 3️⃣ For each completed hackathon, fetch detailed information
    const hackathonHistory = await Promise.all(
      completedHackathons.map(async (hackathon) => {
        const hackathonId = hackathon._id;

        // Get student's team for this hackathon
        const studentRegEntry = await HackRegister.findOne({
          hackathon: hackathonId,
          "students.student": studentObjectId,
        });

        let studentRegId = null;
        if (studentRegEntry) {
          const entry = studentRegEntry.students.find(
            s => s.student.toString() === studentObjectId.toString()
          );
          if (entry) studentRegId = entry._id;
        }

        // Find team where student is a member
        let team = null;
        if (studentRegId) {
          team = await HackTeam.findOne({
            hackathon: hackathonId,
            $or: [
              { students: studentRegId },
              { teamLead: studentRegId }
            ]
          })
          .populate({
            path: "mentor",
            select: "name email"
          })
          .populate({
            path: "selectedProblemStatement",
            select: "title domain"
          });
        }

        // If team found, get team member details
        let teamMembers = [];
        let teamLeadInfo = null;
        
        if (team) {
          // Get all registration IDs
          const allRegIds = [...(team.students || [])];
          if (team.teamLead) allRegIds.push(team.teamLead);
          
          // Fetch student details from registrations
          const regDoc = await HackRegister.findOne({
            hackathon: hackathonId,
            "students._id": { $in: allRegIds }
          }).populate("students.student", "name email rollNo branch");

          if (regDoc) {
            teamMembers = allRegIds.map(regId => {
              const entry = regDoc.students.id(regId);
              if (entry && entry.student) {
                return {
                  _id: entry.student._id,
                  name: entry.student.name,
                  email: entry.student.email,
                  rollNo: entry.student.rollNo,
                  branch: entry.student.branch,
                  isTeamLead: team.teamLead && team.teamLead.toString() === regId.toString()
                };
              }
              return null;
            }).filter(Boolean);

            // Find team lead info
            if (team.teamLead) {
              const leadEntry = regDoc.students.id(team.teamLead);
              if (leadEntry && leadEntry.student) {
                teamLeadInfo = {
                  _id: leadEntry.student._id,
                  name: leadEntry.student.name,
                  email: leadEntry.student.email,
                  rollNo: leadEntry.student.rollNo
                };
              }
            }
          }
        }

        // Get problem statement details
        let problemStatementDetails = null;
        if (team && team.selectedProblemStatement && team.selectedProblemStatementSubId) {
          const psDoc = await ProblemStatement.findById(team.selectedProblemStatement);
          if (psDoc && psDoc.problemStatements) {
            const subPs = psDoc.problemStatements.id(team.selectedProblemStatementSubId);
            if (subPs) {
              problemStatementDetails = {
                domain: psDoc.domain,
                title: subPs.title,
                description: subPs.description
              };
            }
          }
        }

        // Get schedule for this hackathon
        const schedule = await Schedule.findOne({ hackathon: hackathonId })
          .select("days status")
          .lean();

        // Get team progress
        let teamProgress = null;
        if (team) {
          teamProgress = await TeamProgress.findOne({ teamId: team._id })
            .select("percentage status description lastUpdatedBy updatedAt")
            .lean();
        }

        // Get project submission
        let submission = null;
        if (team) {
          submission = await HackSubmission.findOne({
            hackathon: hackathonId,
            team: team._id
          })
          .select("projectDescription githubRepo projectTitle techStack submittedAt status")
          .lean();
        }

        return {
          hackathon: {
            _id: hackathon._id,
            name: hackathon.hackathonname,
            description: hackathon.description,
            startDate: hackathon.regstart,
            endDate: hackathon.enddate,
            year: hackathon.year,
            college: hackathon.college,
            status: hackathon.status,
            banner: hackathon.banner
          },
          team: team ? {
            _id: team._id,
            name: team.name,
            teamLead: teamLeadInfo,
            members: teamMembers,
            mentor: team.mentor ? {
              name: team.mentor.name,
              email: team.mentor.email
            } : null
          } : null,
          problemStatement: problemStatementDetails,
          schedule: schedule ? schedule.days : [],
          teamProgress: teamProgress ? {
            percentage: teamProgress.percentage,
            status: teamProgress.status,
            description: teamProgress.description,
            lastUpdated: teamProgress.updatedAt
          } : null,
          submission: submission ? {
            projectTitle: submission.projectTitle,
            projectDescription: submission.projectDescription,
            githubRepo: submission.githubRepo,
            techStack: submission.techStack,
            submittedAt: submission.submittedAt,
            status: submission.status
          } : null
        };
      })
    );

    res.status(200).json({
      success: true,
      count: hackathonHistory.length,
      hackathons: hackathonHistory
    });

  } catch (error) {
    console.error("❌ Error fetching hackathon history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch hackathon history",
      details: error.message
    });
  }
});

/**
 * @route GET /hackathon-history/student/:studentId/hackathon/:hackathonId
 * @desc Get detailed info for a specific hackathon participation
 */
router.get("/student/:studentId/hackathon/:hackathonId", authenticateToken, async (req, res) => {
  try {
    const { studentId, hackathonId } = req.params;
    const studentObjectId = new mongoose.Types.ObjectId(studentId);
    const hackathonObjectId = new mongoose.Types.ObjectId(hackathonId);

    // Get hackathon details
    const hackathon = await Hackathon.findById(hackathonObjectId);
    if (!hackathon) {
      return res.status(404).json({ success: false, error: "Hackathon not found" });
    }

    // Check if student was registered
    const registration = await HackRegister.findOne({
      hackathon: hackathonObjectId,
      "students.student": studentObjectId,
      "students.status": "approved"
    });

    if (!registration) {
      return res.status(404).json({ 
        success: false, 
        error: "Student registration not found for this hackathon" 
      });
    }

    // Get student's registration entry ID
    const studentEntry = registration.students.find(
      s => s.student.toString() === studentObjectId.toString()
    );
    const studentRegId = studentEntry ? studentEntry._id : null;

    // Find team
    let team = null;
    if (studentRegId) {
      team = await HackTeam.findOne({
        hackathon: hackathonObjectId,
        $or: [
          { students: studentRegId },
          { teamLead: studentRegId }
        ]
      })
      .populate("mentor", "name email")
      .populate("selectedProblemStatement");
    }

    // Get team members with full details
    let teamDetails = null;
    if (team) {
      const allRegIds = [...(team.students || [])];
      if (team.teamLead) allRegIds.push(team.teamLead);

      const regDoc = await HackRegister.findOne({
        hackathon: hackathonObjectId,
        "students._id": { $in: allRegIds }
      }).populate("students.student", "name email rollNo branch github linkedin");

      const members = [];
      if (regDoc) {
        for (const regId of allRegIds) {
          const entry = regDoc.students.id(regId);
          if (entry && entry.student) {
            members.push({
              _id: entry.student._id,
              name: entry.student.name,
              email: entry.student.email,
              rollNo: entry.student.rollNo,
              branch: entry.student.branch,
              github: entry.student.github,
              linkedin: entry.student.linkedin,
              isTeamLead: team.teamLead && team.teamLead.toString() === regId.toString()
            });
          }
        }
      }

      teamDetails = {
        _id: team._id,
        name: team.name,
        members,
        mentor: team.mentor
      };
    }

    // Get problem statement
    let problemStatement = null;
    if (team && team.selectedProblemStatement && team.selectedProblemStatementSubId) {
      const psDoc = await ProblemStatement.findById(team.selectedProblemStatement);
      if (psDoc && psDoc.problemStatements) {
        const subPs = psDoc.problemStatements.id(team.selectedProblemStatementSubId);
        if (subPs) {
          problemStatement = {
            domain: psDoc.domain,
            title: subPs.title,
            description: subPs.description,
            difficulty: subPs.difficulty
          };
        }
      }
    }

    // Get schedule
    const schedule = await Schedule.findOne({ hackathon: hackathonObjectId }).lean();

    // Get team progress with all updates
    let progress = null;
    if (team) {
      progress = await TeamProgress.findOne({ teamId: team._id }).lean();
    }

    // Get submission
    let submission = null;
    if (team) {
      submission = await HackSubmission.findOne({
        hackathon: hackathonObjectId,
        team: team._id
      }).lean();
    }

    res.status(200).json({
      success: true,
      data: {
        hackathon: {
          _id: hackathon._id,
          name: hackathon.hackathonname,
          description: hackathon.description,
          startDate: hackathon.regstart,
          endDate: hackathon.enddate,
          year: hackathon.year,
          college: hackathon.college,
          status: hackathon.status
        },
        team: teamDetails,
        problemStatement,
        schedule: schedule ? schedule.days : [],
        progress,
        submission
      }
    });

  } catch (error) {
    console.error("❌ Error fetching hackathon details:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch hackathon details",
      details: error.message
    });
  }
});

/**
 * @route GET /hackathon-history/student/:studentId/summary
 * @desc Get summary statistics for student's hackathon participation
 */
router.get("/student/:studentId/summary", authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const studentObjectId = new mongoose.Types.ObjectId(studentId);

    // Count all approved registrations
    const allRegistrations = await HackRegister.find({
      "students.student": studentObjectId,
      "students.status": "approved"
    }).populate("hackathon", "status hackathonname");

    const totalParticipated = allRegistrations.length;
    const completedHackathons = allRegistrations.filter(
      reg => reg.hackathon && reg.hackathon.status === "completed"
    ).length;
    const ongoingHackathons = allRegistrations.filter(
      reg => reg.hackathon && reg.hackathon.status === "ongoing"
    ).length;

    // Count submissions
    const submissions = await HackSubmission.countDocuments({
      "teamLead.student": studentObjectId
    });

    // Count submissions where student was team member
    const teamSubmissions = await HackSubmission.countDocuments({
      "teamMembers.student": studentObjectId
    });

    res.status(200).json({
      success: true,
      summary: {
        totalParticipated,
        completedHackathons,
        ongoingHackathons,
        upcomingHackathons: totalParticipated - completedHackathons - ongoingHackathons,
        projectsSubmitted: submissions + teamSubmissions
      }
    });

  } catch (error) {
    console.error("❌ Error fetching summary:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch summary",
      details: error.message
    });
  }
});

// ============================================================================
// COORDINATOR ROUTES - Student Hackathon Details View
// ============================================================================

/**
 * @route GET /hackathon-history/coordinator/students-by-branch
 * @desc Get all students by branch with their registered hackathons
 */
router.get("/coordinator/students-by-branch", authenticateToken, async (req, res) => {
  try {
    const { branch, college, year } = req.query;

    const query = {};
    if (branch) query.branch = branch;
    if (college) query.college = college;
    if (year) query.currentYear = year;

    const students = await Student.find(query)
      .select("name email rollNo branch college currentYear")
      .sort({ name: 1 });

    // For each student, get their registered hackathons
    const studentsWithHackathons = await Promise.all(
      students.map(async (student) => {
        const registrations = await HackRegister.find({
          "students.student": student._id,
          "students.status": "approved"
        }).populate("hackathon", "hackathonname status");

        const hackathons = registrations
          .filter(reg => reg.hackathon)
          .map(reg => ({
            _id: reg.hackathon._id,
            name: reg.hackathon.hackathonname,
            status: reg.hackathon.status
          }));

        return {
          _id: student._id,
          name: student.name,
          email: student.email,
          rollNo: student.rollNo,
          branch: student.branch,
          college: student.college,
          currentYear: student.currentYear,
          hackathonCount: hackathons.length,
          hackathons
        };
      })
    );

    // Filter out students with no hackathon registrations
    const studentsWithRegistrations = studentsWithHackathons.filter(s => s.hackathonCount > 0);

    res.status(200).json({
      success: true,
      count: studentsWithRegistrations.length,
      students: studentsWithRegistrations
    });

  } catch (error) {
    console.error("❌ Error fetching students by branch:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch students",
      details: error.message
    });
  }
});

/**
 * @route GET /hackathon-history/coordinator/student/:studentId/hackathon/:hackathonId/full-details
 * @desc Get comprehensive details for a student's hackathon participation (for coordinator view)
 */
router.get("/coordinator/student/:studentId/hackathon/:hackathonId/full-details", authenticateToken, async (req, res) => {
  try {
    const { studentId, hackathonId } = req.params;
    const studentObjectId = new mongoose.Types.ObjectId(studentId);
    const hackathonObjectId = new mongoose.Types.ObjectId(hackathonId);

    // Get student info
    const student = await Student.findById(studentObjectId)
      .select("name email rollNo branch college currentYear github linkedin phone");
    
    if (!student) {
      return res.status(404).json({ success: false, error: "Student not found" });
    }

    // Get hackathon details
    const hackathon = await Hackathon.findById(hackathonObjectId);
    if (!hackathon) {
      return res.status(404).json({ success: false, error: "Hackathon not found" });
    }

    // Check if student was registered
    const registration = await HackRegister.findOne({
      hackathon: hackathonObjectId,
      "students.student": studentObjectId
    });

    if (!registration) {
      return res.status(404).json({ 
        success: false, 
        error: "Student registration not found for this hackathon" 
      });
    }

    // Get student's registration entry
    const studentEntry = registration.students.find(
      s => s.student.toString() === studentObjectId.toString()
    );

    const registrationDetails = {
      status: studentEntry?.status || "unknown",
      registeredAt: studentEntry?.registeredAt,
      verifiedAt: studentEntry?.verifiedAt,
      transactionId: studentEntry?.transactionId,
      remarks: studentEntry?.remarks
    };

    const studentRegId = studentEntry ? studentEntry._id : null;

    // Find team
    let team = null;
    let teamDetails = null;
    if (studentRegId) {
      team = await HackTeam.findOne({
        hackathon: hackathonObjectId,
        $or: [
          { students: studentRegId },
          { teamLead: studentRegId }
        ]
      }).populate("mentor", "name email phone");

      if (team) {
        // Get team members with full details
        const allRegIds = [...(team.students || [])];
        if (team.teamLead) allRegIds.push(team.teamLead);

        const regDoc = await HackRegister.findOne({
          hackathon: hackathonObjectId,
          "students._id": { $in: allRegIds }
        }).populate("students.student", "name email rollNo branch github linkedin");

        const members = [];
        if (regDoc) {
          for (const regId of allRegIds) {
            const entry = regDoc.students.id(regId);
            if (entry && entry.student) {
              members.push({
                _id: entry.student._id,
                name: entry.student.name,
                email: entry.student.email,
                rollNo: entry.student.rollNo,
                branch: entry.student.branch,
                github: entry.student.github,
                linkedin: entry.student.linkedin,
                isTeamLead: team.teamLead && team.teamLead.toString() === regId.toString()
              });
            }
          }
        }

        teamDetails = {
          _id: team._id,
          name: team.name,
          members,
          mentor: team.mentor ? {
            _id: team.mentor._id,
            name: team.mentor.name,
            email: team.mentor.email,
            phone: team.mentor.phone
          } : null,
          createdAt: team.createdAt
        };
      }
    }

    // Get problem statement
    let problemStatement = null;
    if (team && team.selectedProblemStatement && team.selectedProblemStatementSubId) {
      const psDoc = await ProblemStatement.findById(team.selectedProblemStatement)
        .populate("mentor", "name email");
      if (psDoc && psDoc.problemStatements) {
        const subPs = psDoc.problemStatements.id(team.selectedProblemStatementSubId);
        if (subPs) {
          problemStatement = {
            _id: subPs._id,
            title: subPs.title,
            description: subPs.description,
            difficulty: subPs.difficulty,
            technologies: subPs.technologies,
            mentor: psDoc.mentor ? {
              name: psDoc.mentor.name,
              email: psDoc.mentor.email
            } : null
          };
        }
      }
    }

    // Get submission
    let submission = null;
    if (team) {
      const submissionDoc = await HackSubmission.findOne({
        hackathon: hackathonObjectId,
        team: team._id
      })
      .populate("teamLead.student", "name email rollNo branch")
      .populate("teamMembers.student", "name email rollNo branch")
      .select("-documents.data"); // Exclude file data

      if (submissionDoc) {
        // Build team contributions array
        const teamContributions = [];
        
        // Add team lead contribution
        if (submissionDoc.teamLead && submissionDoc.teamLead.student) {
          teamContributions.push({
            student: {
              _id: submissionDoc.teamLead.student._id,
              name: submissionDoc.teamLead.student.name,
              email: submissionDoc.teamLead.student.email,
              rollNo: submissionDoc.teamLead.student.rollNo,
              branch: submissionDoc.teamLead.student.branch
            },
            contribution: submissionDoc.teamLead.contribution,
            isTeamLead: true
          });
        }
        
        // Add team members contributions
        if (submissionDoc.teamMembers && submissionDoc.teamMembers.length > 0) {
          submissionDoc.teamMembers.forEach(member => {
            if (member.student) {
              teamContributions.push({
                student: {
                  _id: member.student._id,
                  name: member.student.name,
                  email: member.student.email,
                  rollNo: member.student.rollNo,
                  branch: member.student.branch
                },
                contribution: member.contribution,
                isTeamLead: false
              });
            }
          });
        }

        submission = {
          _id: submissionDoc._id,
          projectTitle: submissionDoc.projectTitle,
          projectDescription: submissionDoc.projectDescription,
          githubRepo: submissionDoc.githubRepo,
          liveDemoLink: submissionDoc.liveDemoLink,
          submittedAt: submissionDoc.submittedAt,
          score: submissionDoc.score,
          teamContributions,
          documents: submissionDoc.documents ? submissionDoc.documents.map(doc => ({
            filename: doc.filename,
            fileType: doc.fileType,
            uploadedAt: doc.uploadedAt
          })) : []
        };
      }
    }

    // Get team progress
    let progress = null;
    if (team) {
      progress = await TeamProgress.findOne({ teamId: team._id }).lean();
    }

    // Get mentor feedback given by this student
    const MentorFeedback = require("../Models/mentorfeedback");
    let mentorFeedback = null;
    if (team && team.mentor) {
      mentorFeedback = await MentorFeedback.findOne({
        hackathon: hackathonObjectId,
        student: studentObjectId,
        mentor: team.mentor._id
      }).select("rating feedback createdAt updatedAt");
    }

    // Get certificate if exists
    const HackCertificate = require("../Models/HackCertificate");
    const certificate = await HackCertificate.findOne({
      hackathon: hackathonObjectId,
      recipientId: studentObjectId,
      recipientType: "student"
    }).select("certificateNumber achievementType rank issuedAt downloadedAt");

    // Get schedule
    const schedule = await Schedule.findOne({ hackathon: hackathonObjectId }).lean();

    // Calculate registration count for this hackathon
    const totalRegistrations = registration.students.filter(s => s.status === "approved").length;

    res.status(200).json({
      success: true,
      data: {
        student: {
          _id: student._id,
          name: student.name,
          email: student.email,
          rollNo: student.rollNo,
          branch: student.branch,
          college: student.college,
          currentYear: student.currentYear,
          github: student.github,
          linkedin: student.linkedin,
          phone: student.phone
        },
        hackathon: {
          _id: hackathon._id,
          name: hackathon.hackathonname,
          description: hackathon.description,
          startDate: hackathon.regstart,
          endDate: hackathon.enddate,
          year: hackathon.year,
          college: hackathon.college,
          status: hackathon.status,
          entryFee: hackathon.entryfee,
          totalRegistrations
        },
        registration: registrationDetails,
        team: teamDetails,
        problemStatement,
        submission,
        progress,
        mentorFeedback: mentorFeedback ? {
          rating: mentorFeedback.rating,
          feedback: mentorFeedback.feedback,
          submittedAt: mentorFeedback.createdAt
        } : null,
        certificate: certificate ? {
          certificateNumber: certificate.certificateNumber,
          achievementType: certificate.achievementType,
          rank: certificate.rank,
          issuedAt: certificate.issuedAt,
          downloadedAt: certificate.downloadedAt
        } : null,
        schedule: schedule ? schedule.days : []
      }
    });

  } catch (error) {
    console.error("❌ Error fetching student hackathon full details:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch details",
      details: error.message
    });
  }
});

/**
 * @route GET /hackathon-history/coordinator/branches
 * @desc Get all unique branches from students
 */
router.get("/coordinator/branches", authenticateToken, async (req, res) => {
  try {
    const { college, year } = req.query;
    
    const query = {};
    if (college) query.college = college;
    if (year) query.currentYear = year;

    const branches = await Student.distinct("branch", query);
    
    res.status(200).json({
      success: true,
      branches: branches.filter(Boolean).sort()
    });
  } catch (error) {
    console.error("❌ Error fetching branches:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch branches",
      details: error.message
    });
  }
});

module.exports = router;
