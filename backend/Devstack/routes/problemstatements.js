const express = require("express");
const router = express.Router();

const ProblemStatement = require("../Models/problemstatements");
const HackMentor = require("../Models/Hackmentor");
const HackTeam = require("../Models/hackteam");
const { authenticateToken, requireRole } = require("../../middleware/auth");

/**
 * Add problem statements for approved mentors
 */
router.post(
  "/:hackathonId/add",
  authenticateToken,
  async (req, res) => {
    try {
      const { hackathonId } = req.params;
      const { problemStatements } = req.body;
      const mentorId = req.user.userId || req.user.id || req.user._id;

      console.log('[BACKEND] Add problem statement - mentorId:', mentorId, 'hackathonId:', hackathonId);

      if (!problemStatements || !Array.isArray(problemStatements) || problemStatements.length === 0) {
        return res.status(400).json({ message: "At least one problem statement is required." });
      }

      const hackMentor = await HackMentor.findOne({
        hackathon: hackathonId,
        "mentors.mentor": mentorId,
        "mentors.status": "approved",
      });

      if (!hackMentor) {
        return res.status(403).json({
          message: "You are not approved to add problem statements for this hackathon.",
        });
      }

      for (const ps of problemStatements) {
        if (!ps.title || !ps.description) {
          return res.status(400).json({ message: "Each problem statement must have a title and description." });
        }
      }

      let problemDoc = await ProblemStatement.findOne({ mentor: mentorId, hackathon: hackathonId });

      if (!problemDoc) {
        problemDoc = new ProblemStatement({
          mentor: mentorId,
          hackathon: hackathonId,
          hackMentor: hackMentor._id,
          problemStatements,
        });
      } else {
        problemDoc.problemStatements.push(...problemStatements);
      }

      await problemDoc.save();

      console.log('[BACKEND] Problem statements added successfully');

      res.status(201).json({
        message: "Problem statements added successfully.",
        problemDoc,
      });
    } catch (error) {
      console.error("[BACKEND] Error adding problem statements:", error);
      res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
);

/**
 * Get all problem statements (Admin/Coordinator)
 */
router.get(
  "/",
  authenticateToken,
  requireRole(["admin", "coordinator"]),
  async (req, res) => {
    try {
      const problems = await ProblemStatement.find()
        .populate("mentor", "name email")
        .populate("hackathon", "hackathonname")
        .populate("hackMentor");

      res.status(200).json({
        total: problems.length,
        problems,
      });
    } catch (error) {
      console.error("[BACKEND] Error fetching all problem statements:", error);
      res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
);

/**
 * Get all problem statements by mentor
 */
router.get(
  "/mentor/:mentorId",
  authenticateToken,
  async (req, res) => {
    try {
      const { mentorId } = req.params;
      const userId = req.user.userId || req.user.id || req.user._id;

      console.log('[BACKEND] Get mentor problem statements - userId:', userId, 'mentorId:', mentorId);

      if (req.user.role === "mentor" && userId !== mentorId) {
        return res.status(403).json({ message: "You can only view your own problem statements." });
      }

      const problemStatements = await ProblemStatement.find({ mentor: mentorId })
        .populate("hackathon", "hackathonname description startdate enddate")
        .populate("hackMentor");

      res.status(200).json(problemStatements);
    } catch (error) {
      console.error("[BACKEND] Error fetching mentor problem statements:", error);
      res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
);

/**
 * Get problem statements for a specific team
 * IMPORTANT: This route allows students to view problem statements
 * CRITICAL: Must come BEFORE /:teamId/select-problem to avoid route conflicts
 */
router.get(
  "/:teamId/problem-statements",
  authenticateToken,
  async (req, res) => {
    try {
      const { teamId } = req.params;
      const HackRegister = require("../Models/hack-reg");

      console.log('[BACKEND] Get team problem statements - teamId:', teamId);

      const team = await HackTeam.findById(teamId)
        .populate("hackathon", "hackathonname")
        .populate("mentor", "name email");
      
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Team lead details (from HackRegister document)
      let teamLeadDetails = null;
      if (team.teamLead) {
        try {
          const hackReg = await HackRegister.findOne({
            hackathon: team.hackathon._id,
            "students._id": team.teamLead,
          }).populate("students.student");

          if (hackReg) {
            const studentRegEntry = hackReg.students.id(team.teamLead);
            if (studentRegEntry && studentRegEntry.student) {
              teamLeadDetails = {
                _id: studentRegEntry.student._id,
                registrationId: studentRegEntry._id,
                name: studentRegEntry.student.name,
                email: studentRegEntry.student.email,
                rollNo: studentRegEntry.student.rollNo,
                college: studentRegEntry.student.college,
                branch: studentRegEntry.student.branch,
              };
            }
          }
        } catch (err) {
          console.error("[BACKEND] Error fetching team lead details:", err);
        }
      }

      if (!team.mentor || !team.mentor._id) {
        console.log('[BACKEND] No mentor assigned to team');
        return res.status(200).json({
          problemStatements: [],
          teamLead: teamLeadDetails,
          team: {
            _id: team._id,
            name: team.name,
            selectedProblemStatement: null,
            selectedProblemStatementSubId: null,
          },
          message: "No mentor assigned to this team yet",
        });
      }

      // Find all ProblemStatement docs for this mentor/hackathon
      const docs = await ProblemStatement.find({
        hackathon: team.hackathon._id,
        mentor: team.mentor._id,
      });

      console.log('[BACKEND] Found', docs.length, 'problem statement documents');

      // Flatten all subdocuments with selection status
      const problemStatements = docs.flatMap((doc) =>
        doc.problemStatements.map((ps) => ({
          _id: ps._id,
          title: ps.title,
          description: ps.description,
          technologies: ps.technologies || [],
          isSelected: ps.isSelected || false,
          selectedBy: ps.selectedBy || null,
          parentId: doc._id,
        }))
      );

      console.log('[BACKEND] Returning', problemStatements.length, 'problem statements');
      console.log('[BACKEND] Team selection:', {
        selectedProblemStatement: team.selectedProblemStatement,
        selectedProblemStatementSubId: team.selectedProblemStatementSubId
      });

      res.status(200).json({
        problemStatements,
        teamLead: teamLeadDetails,
        team: {
          _id: team._id,
          name: team.name,
          hackathon: team.hackathon,
          mentor: team.mentor,
          selectedProblemStatement: team.selectedProblemStatement || null,
          selectedProblemStatementSubId: team.selectedProblemStatementSubId || null,
        },
      });
    } catch (error) {
      console.error("[BACKEND] Error fetching team problem statements:", error);
      res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  }
);

/**
 * Select a problem statement for a team
 * NO ROLE MIDDLEWARE - Verification is done through team lead check
 * IMPORTANT: This must come AFTER the /:teamId/problem-statements route
 */
router.put('/:teamId/select-problem', authenticateToken, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { parentId, problemStatementSubId, hackathonId } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    console.log('='.repeat(70));
    console.log('[BACKEND] ▶ Problem Statement Selection Request');
    console.log('[BACKEND] User ID:', userId);
    console.log('[BACKEND] Team ID:', teamId);
    console.log('[BACKEND] Parent ID:', parentId);
    console.log('[BACKEND] Problem Sub ID:', problemStatementSubId);
    console.log('[BACKEND] Hackathon ID:', hackathonId);
    console.log('='.repeat(70));

    // Validate userId
    if (!userId) {
      console.log('[BACKEND] ✗ ERROR: No userId found in token');
      return res.status(401).json({ 
        message: "Unauthorized: user not found in token",
        tokenData: req.user 
      });
    }
    
    // Validate required fields
    if (!parentId || !problemStatementSubId) {
      console.log('[BACKEND] ✗ ERROR: Missing required fields');
      return res.status(400).json({ 
        message: "Missing required fields: parentId and problemStatementSubId" 
      });
    }

    // Find team
    const team = await HackTeam.findById(teamId);
    if (!team) {
      console.log('[BACKEND] ✗ ERROR: Team not found');
      return res.status(404).json({ message: "Team not found" });
    }

    console.log('[BACKEND] ✓ Team found:', team.name);

    // Check if team already has a selection
    if (team.selectedProblemStatement) {
      console.log('[BACKEND] ✗ ERROR: Team already has a selection');
      return res.status(400).json({
        message: "Your team has already selected a problem statement. You cannot change it.",
        currentSelection: team.selectedProblemStatement
      });
    }

    // Validate hackathon match
    if (hackathonId && team.hackathon.toString() !== hackathonId.toString()) {
      console.log('[BACKEND] ✗ ERROR: Hackathon mismatch');
      return res.status(400).json({ message: "Hackathon mismatch." });
    }

    // Fetch registration to verify team lead
    const HackRegister = require('../Models/hack-reg');
    const hackReg = await HackRegister.findOne({
      hackathon: team.hackathon,
      'students._id': team.teamLead,
    }).populate('students.student');

    if (!hackReg) {
      console.log('[BACKEND] ✗ ERROR: Registration not found');
      return res.status(400).json({ message: "Registration not found for this team" });
    }

    const leadEntry = hackReg.students.id(team.teamLead);
    if (!leadEntry || !leadEntry.student) {
      console.log('[BACKEND] ✗ ERROR: Team lead entry not found');
      return res.status(400).json({ message: "Team lead entry not found" });
    }

    const leadStudentId = leadEntry.student._id.toString();
    const currentUserId = userId.toString();

    console.log('[BACKEND] Team Lead Verification:');
    console.log('[BACKEND]   - Team Lead ID:', leadStudentId);
    console.log('[BACKEND]   - Current User ID:', currentUserId);
    console.log('[BACKEND]   - Team Lead Name:', leadEntry.student.name);
    console.log('[BACKEND]   - Match:', leadStudentId === currentUserId);

    // Verify current user is team lead
    if (leadStudentId !== currentUserId) {
      console.log('[BACKEND] ✗ ERROR: User is not the team lead');
      return res.status(403).json({
        message: "Only the team lead can select the problem statement.",
        teamLead: {
          id: leadStudentId,
          name: leadEntry.student.name,
          email: leadEntry.student.email
        },
        yourId: currentUserId
      });
    }

    console.log('[BACKEND] ✓ Team lead verification passed');

    // Fetch problem document
    const problemDoc = await ProblemStatement.findById(parentId);
    if (!problemDoc) {
      console.log('[BACKEND] ✗ ERROR: Problem document not found');
      return res.status(404).json({ message: "Parent problem statement not found" });
    }

    console.log('[BACKEND] ✓ Problem document found');

    // Validate mentor match
    if (problemDoc.mentor.toString() !== team.mentor.toString()) {
      console.log('[BACKEND] ✗ ERROR: Mentor mismatch');
      console.log('[BACKEND]   - Problem Mentor:', problemDoc.mentor.toString());
      console.log('[BACKEND]   - Team Mentor:', team.mentor.toString());
      return res.status(403).json({ 
        message: "This problem statement doesn't belong to your mentor." 
      });
    }

    // Validate hackathon match
    if (problemDoc.hackathon.toString() !== team.hackathon.toString()) {
      console.log('[BACKEND] ✗ ERROR: Hackathon mismatch in problem');
      return res.status(403).json({ 
        message: "This problem statement doesn't belong to your hackathon." 
      });
    }

    console.log('[BACKEND] ✓ Mentor and hackathon validation passed');

    // Find subdocument
    const subdoc = problemDoc.problemStatements.id(problemStatementSubId);
    if (!subdoc) {
      console.log('[BACKEND] ✗ ERROR: Problem subdocument not found');
      const availableIds = problemDoc.problemStatements.map(ps => ps._id.toString());
      console.log('[BACKEND]   Available IDs:', availableIds);
      return res.status(404).json({ 
        message: "Problem statement not found",
        availableIds
      });
    }

    console.log('[BACKEND] ✓ Problem subdocument found:', subdoc.title);

    // Check if already selected by another team
    if (subdoc.isSelected && subdoc.selectedBy && subdoc.selectedBy.toString() !== teamId) {
      console.log('[BACKEND] ✗ ERROR: Problem already selected by another team');
      console.log('[BACKEND]   Selected by team:', subdoc.selectedBy);
      return res.status(400).json({
        message: "This problem statement is already selected by another team.",
      });
    }

    console.log('[BACKEND] ✓ Problem is available for selection');

    // Mark as selected
    subdoc.isSelected = true;
    subdoc.selectedBy = team._id;
    await problemDoc.save();

    console.log('[BACKEND] ✓ Problem marked as selected in database');

    // Update team
    team.selectedProblemStatement = parentId;
    team.selectedProblemStatementSubId = problemStatementSubId;
    await team.save();

    console.log('[BACKEND] ✓ Team record updated with selection');

    // Fetch updated team with populated fields
    const updatedTeam = await HackTeam.findById(team._id)
      .populate("hackathon", "hackathonname")
      .populate("mentor", "name email");

    console.log('[BACKEND] ✓✓✓ SUCCESS: Problem statement selected!');
    console.log('[BACKEND] Final state:', {
      selectedProblemStatement: updatedTeam.selectedProblemStatement,
      selectedProblemStatementSubId: updatedTeam.selectedProblemStatementSubId
    });
    console.log('='.repeat(70));

    res.status(200).json({
      message: "Problem statement selected successfully.",
      selectedProblemStatement: parentId,
      selectedProblemStatementSubId: problemStatementSubId,
      problemTitle: subdoc.title,
      problemDescription: subdoc.description,
      updatedTeam,
    });

  } catch (error) {
    console.error('[BACKEND] ✗✗✗ CRITICAL ERROR in select-problem:', error);
    console.error('[BACKEND] Error stack:', error.stack);
    console.log('='.repeat(70));
    
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Update a specific problem statement (mentor only)
 * IMPORTANT: This route must come AFTER /:teamId/select-problem to avoid conflicts
 */
router.put(
  "/:hackathonId/:problemId",
  authenticateToken,
  requireRole(["mentor"]),
  async (req, res) => {
    try {
      const { hackathonId, problemId } = req.params;
      const { title, description, technologies } = req.body;
      const mentorId = req.user.userId || req.user.id || req.user._id;

      console.log('[BACKEND] Update problem statement - mentorId:', mentorId, 'problemId:', problemId);

      const problemDoc = await ProblemStatement.findOne({ mentor: mentorId, hackathon: hackathonId });
      if (!problemDoc) {
        return res.status(404).json({ message: "No problem statements found for this hackathon." });
      }

      const problem = problemDoc.problemStatements.id(problemId);
      if (!problem) {
        return res.status(404).json({ message: "Problem statement not found." });
      }

      if (title) problem.title = title;
      if (description) problem.description = description;
      if (technologies && Array.isArray(technologies)) problem.technologies = technologies;

      await problemDoc.save();

      console.log('[BACKEND] Problem statement updated successfully');

      res.status(200).json({
        message: "Problem statement updated successfully.",
        updatedProblem: problem,
      });
    } catch (error) {
      console.error("[BACKEND] Error updating problem statement:", error);
      res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
);

/**
 * Delete a specific problem statement (mentor only)
 */
router.delete(
  "/:hackathonId/:problemId",
  authenticateToken,
  requireRole(["mentor"]),
  async (req, res) => {
    try {
      const { hackathonId, problemId } = req.params;
      const mentorId = req.user.userId || req.user.id || req.user._id;

      console.log('[BACKEND] Delete problem statement - mentorId:', mentorId, 'problemId:', problemId);

      const problemDoc = await ProblemStatement.findOne({ mentor: mentorId, hackathon: hackathonId });
      if (!problemDoc) {
        return res.status(404).json({ message: "No problem statements found for this hackathon." });
      }

      problemDoc.problemStatements = problemDoc.problemStatements.filter(
        (ps) => ps._id.toString() !== problemId
      );

      await problemDoc.save();

      console.log('[BACKEND] Problem statement deleted successfully');

      res.status(200).json({ message: "Problem statement deleted successfully.", problemDoc });
    } catch (error) {
      console.error("[BACKEND] Error deleting problem statement:", error);
      res.status(500).json({ message: "Internal server error", error: error.message });
    }
  }
);

module.exports = router;