const express = require("express");
const router = express.Router();
const HackMentor = require("../Models/Hackmentor");
const Hackathon = require("../Models/HackathonAdmin");
const HackTeam = require("../Models/hackteam");
const HackSubmission = require("../Models/hacksubmission");
const HackRegister = require("../Models/hack-reg");
const TeamProgress = require("../Models/teamprogress");
const Schedule = require("../Models/schedule");
const ProblemStatement = require("../Models/problemstatements");
const MentorFeedback = require("../Models/mentorfeedback");
const { authenticateToken } = require("../../middleware/auth");
const mongoose = require("mongoose");

/**
 * @route GET /mentor-hackathon-history/mentor/:mentorId/completed
 * @desc Get all completed hackathons for a mentor with full details
 */
router.get("/mentor/:mentorId/completed", authenticateToken, async (req, res) => {
  try {
    const { mentorId } = req.params;
    const mentorObjectId = new mongoose.Types.ObjectId(mentorId);

    console.log("🔍 Fetching completed hackathon history for mentor:", mentorId);

    // 1️⃣ Find all hackathons where mentor is approved
    const approvedMentorRegs = await HackMentor.find({
      "mentors.mentor": mentorObjectId,
      "mentors.status": "approved",
    }).populate({
      path: "hackathon",
      select: "hackathonname entryfee regstart enddate status year college description banner"
    });

    if (!approvedMentorRegs || approvedMentorRegs.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No hackathon history found",
        hackathons: []
      });
    }

    // 2️⃣ Filter only completed hackathons
    const completedHackathons = approvedMentorRegs
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

        // Get all teams mentored by this mentor in this hackathon
        const mentoredTeams = await HackTeam.find({
          hackathon: hackathonId,
          mentor: mentorObjectId
        })
        .populate("selectedProblemStatement", "domain")
        .lean();

        // Get detailed team information
        const teamsWithDetails = await Promise.all(
          mentoredTeams.map(async (team) => {
            // Get team members
            const allRegIds = [...(team.students || [])];
            if (team.teamLead) allRegIds.push(team.teamLead);

            let teamMembers = [];
            let teamLeadInfo = null;

            if (allRegIds.length > 0) {
              const regDoc = await HackRegister.findOne({
                hackathon: hackathonId,
                "students._id": { $in: allRegIds }
              }).populate("students.student", "name email rollNo branch");

              if (regDoc) {
                teamMembers = allRegIds.map(regId => {
                  const entry = regDoc.students.id(regId);
                  if (entry && entry.student) {
                    const isLead = team.teamLead && team.teamLead.toString() === regId.toString();
                    if (isLead) {
                      teamLeadInfo = {
                        _id: entry.student._id,
                        name: entry.student.name,
                        email: entry.student.email,
                        rollNo: entry.student.rollNo
                      };
                    }
                    return {
                      _id: entry.student._id,
                      name: entry.student.name,
                      email: entry.student.email,
                      rollNo: entry.student.rollNo,
                      branch: entry.student.branch,
                      isTeamLead: isLead
                    };
                  }
                  return null;
                }).filter(Boolean);
              }
            }

            // Get problem statement details
            let problemStatementDetails = null;
            if (team.selectedProblemStatement && team.selectedProblemStatementSubId) {
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

            // Get team progress
            const teamProgress = await TeamProgress.findOne({ teamId: team._id })
              .select("percentage status description updatedAt")
              .lean();

            // Get project submission
            const submission = await HackSubmission.findOne({
              hackathon: hackathonId,
              team: team._id
            })
            .select("projectDescription githubRepo projectTitle techStack submittedAt status")
            .lean();

            return {
              _id: team._id,
              name: team.name,
              teamLead: teamLeadInfo,
              members: teamMembers,
              problemStatement: problemStatementDetails,
              progress: teamProgress ? {
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

        // Get schedule for this hackathon
        const schedule = await Schedule.findOne({ hackathon: hackathonId })
          .select("days status")
          .lean();

        // Get all problem statements for this hackathon
        const problemStatements = await ProblemStatement.find({ hackathon: hackathonId })
          .select("domain problemStatements")
          .lean();

        const allProblemStatements = problemStatements.flatMap(ps => 
          ps.problemStatements.map(sub => ({
            domain: ps.domain,
            title: sub.title,
            description: sub.description
          }))
        );

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
          teams: teamsWithDetails,
          teamsCount: teamsWithDetails.length,
          schedule: schedule ? schedule.days : [],
          problemStatements: allProblemStatements
        };
      })
    );

    // For each hackathon, also fetch ALL teams progress and ALL submissions (not just mentored teams)
    const enrichedHistory = await Promise.all(
      hackathonHistory.map(async (hackData) => {
        const hackathonId = hackData.hackathon._id;

        // Get ALL teams for this hackathon with progress
        const allTeams = await HackTeam.find({ hackathon: hackathonId })
          .populate("mentor", "name email")
          .lean();

        const allTeamsProgress = await Promise.all(
          allTeams.map(async (team) => {
            // Get team members info
            const allRegIds = [...(team.students || [])];
            if (team.teamLead) allRegIds.push(team.teamLead);

            let teamName = team.name;
            let teamLeadName = null;
            let memberCount = 0;

            if (allRegIds.length > 0) {
              const regDoc = await HackRegister.findOne({
                hackathon: hackathonId,
                "students._id": { $in: allRegIds }
              }).populate("students.student", "name");

              if (regDoc) {
                memberCount = allRegIds.length;
                if (team.teamLead) {
                  const leadEntry = regDoc.students.id(team.teamLead);
                  if (leadEntry && leadEntry.student) {
                    teamLeadName = leadEntry.student.name;
                  }
                }
              }
            }

            // Get progress
            const progress = await TeamProgress.findOne({ teamId: team._id })
              .select("percentage status description updatedAt")
              .lean();

            return {
              _id: team._id,
              name: teamName,
              teamLead: teamLeadName,
              memberCount,
              mentorName: team.mentor?.name || 'Not Assigned',
              isMentoredByMe: hackData.teams.some(t => t._id.toString() === team._id.toString()),
              progress: progress ? {
                percentage: progress.percentage,
                status: progress.status,
                description: progress.description,
                lastUpdated: progress.updatedAt
              } : { percentage: 0, status: 'Not Started', description: '' }
            };
          })
        );

        // Get ALL submissions for this hackathon with scores
        const allSubmissions = await HackSubmission.find({ hackathon: hackathonId })
          .populate("team", "name")
          .select("team projectDescription githubRepo liveDemoLink score submittedAt")
          .lean();

        const submissionsWithDetails = await Promise.all(
          allSubmissions.map(async (sub) => {
            const team = await HackTeam.findById(sub.team?._id || sub.team)
              .populate("mentor", "name")
              .lean();

            let teamLeadName = null;
            if (team?.teamLead) {
              const regDoc = await HackRegister.findOne({
                hackathon: hackathonId,
                "students._id": team.teamLead
              }).populate("students.student", "name");
              
              if (regDoc) {
                const leadEntry = regDoc.students.id(team.teamLead);
                if (leadEntry?.student) {
                  teamLeadName = leadEntry.student.name;
                }
              }
            }

            // Get problem statement info
            let problemTitle = 'N/A';
            if (team?.selectedProblemStatement && team?.selectedProblemStatementSubId) {
              const psDoc = await ProblemStatement.findById(team.selectedProblemStatement);
              if (psDoc?.problemStatements) {
                const subPs = psDoc.problemStatements.id(team.selectedProblemStatementSubId);
                if (subPs) problemTitle = subPs.title;
              }
            }

            return {
              _id: sub._id,
              teamId: team?._id,
              teamName: team?.name || 'Unknown',
              teamLead: teamLeadName,
              mentorName: team?.mentor?.name || 'Not Assigned',
              isMentoredByMe: hackData.teams.some(t => t._id.toString() === (team?._id?.toString() || '')),
              problemTitle,
              projectDescription: sub.projectDescription,
              githubRepo: sub.githubRepo,
              liveDemoLink: sub.liveDemoLink,
              score: sub.score || 0,
              submittedAt: sub.submittedAt
            };
          })
        );

        // Get feedback received by this mentor for this hackathon
        const mentorFeedback = await MentorFeedback.find({
          hackathon: hackathonId,
          mentor: new mongoose.Types.ObjectId(req.params.mentorId)
        })
        .populate("student", "name rollNo")
        .select("student rating feedback createdAt")
        .lean();

        const feedbackSummary = {
          totalFeedbacks: mentorFeedback.length,
          averageRating: mentorFeedback.length > 0 
            ? (mentorFeedback.reduce((sum, f) => sum + f.rating, 0) / mentorFeedback.length).toFixed(1)
            : 0,
          feedbacks: mentorFeedback.map(f => ({
            studentName: f.student?.name || 'Anonymous',
            studentRollNo: f.student?.rollNo,
            rating: f.rating,
            feedback: f.feedback,
            date: f.createdAt
          }))
        };

        return {
          ...hackData,
          allTeamsProgress,
          allSubmissions: submissionsWithDetails,
          evaluation: feedbackSummary
        };
      })
    );

    res.status(200).json({
      success: true,
      count: enrichedHistory.length,
      hackathons: enrichedHistory
    });

  } catch (error) {
    console.error("❌ Error fetching mentor hackathon history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch hackathon history",
      details: error.message
    });
  }
});

/**
 * @route GET /mentor-hackathon-history/mentor/:mentorId/summary
 * @desc Get summary statistics for mentor's hackathon participation
 */
router.get("/mentor/:mentorId/summary", authenticateToken, async (req, res) => {
  try {
    const { mentorId } = req.params;
    const mentorObjectId = new mongoose.Types.ObjectId(mentorId);

    // Count all approved mentor registrations
    const allRegistrations = await HackMentor.find({
      "mentors.mentor": mentorObjectId,
      "mentors.status": "approved"
    }).populate("hackathon", "status hackathonname");

    const totalParticipated = allRegistrations.length;
    const completedHackathons = allRegistrations.filter(
      reg => reg.hackathon && reg.hackathon.status === "completed"
    ).length;
    const ongoingHackathons = allRegistrations.filter(
      reg => reg.hackathon && reg.hackathon.status === "ongoing"
    ).length;

    // Count total teams mentored
    const totalTeamsMentored = await HackTeam.countDocuments({
      mentor: mentorObjectId
    });

    // Count submissions from mentored teams
    const mentoredTeams = await HackTeam.find({ mentor: mentorObjectId }).select("_id");
    const teamIds = mentoredTeams.map(t => t._id);
    const totalSubmissions = await HackSubmission.countDocuments({
      team: { $in: teamIds }
    });

    res.status(200).json({
      success: true,
      summary: {
        totalParticipated,
        completedHackathons,
        ongoingHackathons,
        upcomingHackathons: totalParticipated - completedHackathons - ongoingHackathons,
        totalTeamsMentored,
        totalSubmissions
      }
    });

  } catch (error) {
    console.error("❌ Error fetching mentor summary:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch summary",
      details: error.message
    });
  }
});

module.exports = router;
