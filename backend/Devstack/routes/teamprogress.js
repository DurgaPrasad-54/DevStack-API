const express = require('express');
const router = express.Router();
const TeamProgress = require('../Models/teamprogress');
const HackTeam = require('../Models/hackteam');
const HackRegister = require('../Models/hack-reg');
const { authenticateToken } = require("../../middleware/auth");

// Helper function to check if user is team lead
async function isTeamLead(userId, teamId) {
  try {
    const team = await HackTeam.findById(teamId);
    if (!team || !team.teamLead) return false;

    // Debug: log basic identifiers
    console.log('[BACKEND] isTeamLead check - userId:', userId, 'teamId:', teamId);
    console.log('[BACKEND] isTeamLead - team.hackathon:', team.hackathon, 'team.teamLead:', team.teamLead);

    // Get the team lead's student ID from registration
    const hackReg = await HackRegister.findOne({
      hackathon: team.hackathon,
      'students._id': team.teamLead,
    }).populate('students.student');

    if (!hackReg) return false;

    const leadEntry = hackReg.students.id(team.teamLead);
    if (!leadEntry) {
      console.log('[BACKEND] isTeamLead - leadEntry not found for teamLead id:', team.teamLead);
      return false;
    }

    // If leadEntry exists but student subdoc not populated, attempt to fetch student's id
    let leadStudentId = null;
    if (leadEntry.student && leadEntry.student._id) {
      leadStudentId = leadEntry.student._id.toString();
    } else if (leadEntry.student) {
      // If student stored as plain value
      leadStudentId = leadEntry.student.toString();
    }

    const currentUserId = userId ? userId.toString() : null;

    console.log('[BACKEND] isTeamLead - leadStudentId:', leadStudentId, 'currentUserId:', currentUserId);

    // Fallback checks: sometimes teamLead may already be the registration entry id
    // or token may contain different id field formats. Accept if any match.
    if (leadStudentId && currentUserId && leadStudentId === currentUserId) return true;

    try {
      // Check if the registration subdoc id equals the current user (edge case)
      if (team.teamLead && currentUserId && team.teamLead.toString() === currentUserId) {
        console.log('[BACKEND] isTeamLead - matched by registration id equals current user id');
        return true;
      }
    } catch (e) {
      // ignore
    }

    // As a final fallback, search hackReg.students for an entry where student equals currentUserId and its _id matches team.teamLead
    if (currentUserId) {
      const match = hackReg.students.find(s => {
        try {
          const sid = s.student && s.student._id ? s.student._id.toString() : (s.student ? s.student.toString() : null);
          const regId = s._id ? s._id.toString() : null;
          return sid === currentUserId && regId === team.teamLead.toString();
        } catch (e) {
          return false;
        }
      });
      if (match) {
        console.log('[BACKEND] isTeamLead - matched by searching hackReg.students fallback');
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('[BACKEND] Error checking team lead:', error);
    return false;
  }
}

// Helper function to check if 30 minutes have passed
function canUpdate(lastUpdateTime) {
  if (!lastUpdateTime) return true;
  
  const thirtyMinutesInMs = 30 * 60 * 1000;
  const timeDiff = Date.now() - new Date(lastUpdateTime).getTime();
  
  return timeDiff >= thirtyMinutesInMs;
}

// Helper function to get remaining cooldown time
function getRemainingCooldown(lastUpdateTime) {
  if (!lastUpdateTime) return 0;
  
  const thirtyMinutesInMs = 30 * 60 * 1000;
  const timeDiff = Date.now() - new Date(lastUpdateTime).getTime();
  const remaining = thirtyMinutesInMs - timeDiff;
  
  return Math.max(0, remaining);
}

/**
 * POST /teamprogress - Create or update team progress (Team Lead Only)
 */
router.post('/teamprogress', authenticateToken, async (req, res) => {
  try {
    const { hackathonId, teamId, percentage, description } = req.body;
    const userId = req.user.userId || req.user.id || req.user._id;

    console.log('[BACKEND] Team progress update request');
    console.log('[BACKEND] User ID:', userId);
    console.log('[BACKEND] Team ID:', teamId);
    console.log('[BACKEND] Percentage:', percentage);

    // Validation
    if (!hackathonId || !teamId || percentage === undefined) {
      return res.status(400).json({ 
        message: 'hackathonId, teamId, and percentage are required' 
      });
    }

    if (percentage < 0 || percentage > 100) {
      return res.status(400).json({ 
        message: 'Percentage must be between 0 and 100' 
      });
    }

    // Check if user is team lead
    const isLead = await isTeamLead(userId, teamId);
    if (!isLead) {
      console.log('[BACKEND] User is not team lead');
      return res.status(403).json({ 
        message: 'Only the team lead can update progress',
        error: 'NOT_TEAM_LEAD'
      });
    }

    console.log('[BACKEND] Team lead verification passed');

    // Check for existing progress
    const existingProgress = await TeamProgress.findOne({ 
      teamId, 
      hackathonId 
    });

    // Check 30-minute cooldown
    if (existingProgress) {
      const canUpdateNow = canUpdate(existingProgress.updatedAt);
      
      if (!canUpdateNow) {
        const remainingMs = getRemainingCooldown(existingProgress.updatedAt);
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        
        console.log('[BACKEND] Update cooldown active');
        return res.status(429).json({ 
          message: `You can update progress again in ${remainingMinutes} minute(s)`,
          error: 'COOLDOWN_ACTIVE',
          remainingTime: remainingMs,
          remainingMinutes,
          lastUpdate: existingProgress.updatedAt
        });
      }
    }

    // Determine status
    let status = 'Not Started';
    if (percentage > 0 && percentage < 100) status = 'In Progress';
    else if (percentage === 100) status = 'Completed';

    // Update or create progress
    const progress = await TeamProgress.findOneAndUpdate(
      { teamId, hackathonId },
      { 
        percentage, 
        status,
        description: description || '',
        lastUpdatedBy: userId
      },
      { 
        new: true, 
        upsert: true, 
        setDefaultsOnInsert: true 
      }
    );

    console.log('[BACKEND] Progress updated successfully');

    res.status(200).json({
      message: 'Team progress updated successfully',
      progress,
      nextUpdateAvailable: new Date(Date.now() + 30 * 60 * 1000)
    });

  } catch (error) {
    console.error('[BACKEND] Error updating team progress:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

/**
 * PUT /teamprogress - Update team progress (Team Lead Only)
 * Alternative route for updates
 */
router.put('/teamprogress', authenticateToken, async (req, res) => {
  // Reuse POST logic
  req.method = 'POST';
  return router.handle(req, res);
});

/**
 * GET /teamprogress/:hackathonId/:teamId - Get specific team progress
 */
router.get('/teamprogress/:hackathonId/:teamId', authenticateToken, async (req, res) => {
  try {
    const { hackathonId, teamId } = req.params;
    const userId = req.user.userId || req.user.id || req.user._id;

    console.log('[BACKEND] Fetching team progress');
    console.log('[BACKEND] Team ID:', teamId);

    const progress = await TeamProgress.findOne({ 
      hackathonId, 
      teamId 
    });

    if (!progress) {
      // Return default progress if none exists. Include explicit isTeamLead so frontend trusts backend.
      const lead = await isTeamLead(userId, teamId);
      return res.status(200).json({
        hackathonId,
        teamId,
        percentage: 0,
        status: 'Not Started',
        description: '',
        canUpdate: lead,
        isTeamLead: lead,
        lastUpdate: null,
        remainingCooldown: 0,
        nextUpdateAvailable: null
      });
    }

    // Check if user can update
    const isLead = await isTeamLead(userId, teamId);
    const canUpdateNow = canUpdate(progress.updatedAt);
    const remainingMs = getRemainingCooldown(progress.updatedAt);

    res.status(200).json({
      ...progress.toObject(),
      canUpdate: isLead && canUpdateNow,
      isTeamLead: isLead,
      remainingCooldown: remainingMs,
      nextUpdateAvailable: remainingMs > 0 
        ? new Date(Date.now() + remainingMs) 
        : new Date()
    });

  } catch (error) {
    console.error('[BACKEND] Error fetching team progress:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

/**
 * GET /teamprogress/:hackathonId - Get all team progress for a hackathon
 */
router.get('/teamprogress/:hackathonId', authenticateToken, async (req, res) => {
  try {
    const { hackathonId } = req.params;

    console.log('[BACKEND] Fetching all team progress for hackathon:', hackathonId);

    const progresses = await TeamProgress.find({ hackathonId })
      .populate({
        path: 'teamId',
        select: 'name students teamLead',
        populate: {
          path: 'teamLead',
          select: 'student'
        }
      })
      .sort({ updatedAt: -1 });

    res.status(200).json({
      total: progresses.length,
      progresses
    });

  } catch (error) {
    console.error('[BACKEND] Error fetching team progresses:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

/**
 * GET /teamprogress/myteam/:hackathonId - Get authenticated user's team progress
 */
router.get('/teamprogress/myteam/:hackathonId', authenticateToken, async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const userId = req.user.userId || req.user.id || req.user._id;

    console.log('[BACKEND] Fetching my team progress');
    console.log('[BACKEND] User ID:', userId);

    // Find user's team
    const hackRegEntry = await HackRegister.findOne({
      'students.student': userId,
      hackathon: hackathonId
    });

    if (!hackRegEntry) {
      return res.status(404).json({ 
        message: 'No registration found for this hackathon' 
      });
    }

    const studentRegEntry = hackRegEntry.students.find(s =>
      s.student.toString() === userId
    );

    if (!studentRegEntry) {
      return res.status(404).json({ 
        message: 'Registration entry not found' 
      });
    }

    let team = await HackTeam.findOne({
      students: studentRegEntry._id,
      hackathon: hackathonId
    });

    if (!team) {
      return res.status(404).json({ 
        message: 'No team found for this hackathon' 
      });
    }

    // Populate teamLead -> student to provide lead student id
    try {
      await team.populate({
        path: 'teamLead',
        populate: { path: 'student' }
      });
    } catch (e) {
      console.warn('[BACKEND] Warning populating teamLead student:', e.message || e);
    }

    // Get progress
    const progress = await TeamProgress.findOne({ 
      hackathonId, 
      teamId: team._id 
    });

    const isLead = await isTeamLead(userId, team._id);
    const canUpdateNow = progress ? canUpdate(progress.updatedAt) : true;
    const remainingMs = progress ? getRemainingCooldown(progress.updatedAt) : 0;

    res.status(200).json({
      team: {
        _id: team._id,
        name: team.name,
        teamLead: team.teamLead && team.teamLead.student ? team.teamLead.student._id : (team.teamLead ? team.teamLead.toString() : null)
      },
      progress: progress ? progress.toObject() : {
        hackathonId,
        teamId: team._id,
        percentage: 0,
        status: 'Not Started',
        description: ''
      },
      canUpdate: isLead && canUpdateNow,
      isTeamLead: isLead,
      remainingCooldown: remainingMs,
      nextUpdateAvailable: remainingMs > 0 
        ? new Date(Date.now() + remainingMs) 
        : new Date()
    });

  } catch (error) {
    console.error('[BACKEND] Error fetching my team progress:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

router.get('/teams/progress/all', authenticateToken, async (req, res) => {
  try {
    const { 
      hackathonId, 
      branch, 
      college, 
      sortBy = 'progress',
      sortOrder = 'desc'
    } = req.query;

    console.log('[BACKEND] Fetching all teams progress with filters:', req.query);

    if (!hackathonId) {
      return res.status(400).json({ 
        message: 'hackathonId is required' 
      });
    }

    // Find all teams for this hackathon
    const teams = await HackTeam.find({ hackathon: hackathonId })
      .populate('mentor', 'name email')
      .lean();

    console.log('[BACKEND] Found', teams.length, 'teams for hackathon');

    // Get all team progresses
    const progresses = await TeamProgress.find({ hackathonId })
      .lean();

    // Create a map of team progress
    const progressMap = {};
    progresses.forEach(p => {
      progressMap[p.teamId.toString()] = p;
    });

    // Fetch student details for each team and apply filters
    const teamsWithDetails = await Promise.all(
      teams.map(async (team) => {
        try {
          // Get team lead and students details
          const hackReg = await HackRegister.findOne({
            hackathon: hackathonId,
            'students._id': { $in: team.students }
          }).populate('students.student');

          if (!hackReg) {
            return null;
          }

          // Get all student details
          const studentDetails = [];
          let teamLeadDetails = null;

          for (const regId of team.students) {
            const regEntry = hackReg.students.id(regId);
            if (regEntry && regEntry.student) {
              const studentInfo = {
                _id: regEntry.student._id,
                name: regEntry.student.name,
                email: regEntry.student.email,
                rollNo: regEntry.student.rollNo,
                branch: regEntry.student.branch,
                college: regEntry.student.college,
                year: regEntry.student.currentYear,
                github: regEntry.student.github,
                linkedin: regEntry.student.linkedin
              };

              studentDetails.push(studentInfo);

              // Check if this is the team lead
              if (team.teamLead && regId.toString() === team.teamLead.toString()) {
                teamLeadDetails = studentInfo;
              }
            }
          }

          // Apply filters based on team members
          // Filter by branch
          if (branch) {
            const hasMatchingBranch = studentDetails.some(s => s.branch === branch);
            if (!hasMatchingBranch) return null;
          }

          // Filter by college
          if (college) {
            const hasMatchingCollege = studentDetails.some(s => s.college === college);
            if (!hasMatchingCollege) return null;
          }

          // Get progress for this team
          const progress = progressMap[team._id.toString()] || {
            percentage: 0,
            status: 'Not Started',
            description: '',
            updatedAt: null
          };

          return {
            _id: team._id,
            name: team.name,
            hackathon: team.hackathon,
            teamLead: teamLeadDetails,
            students: studentDetails,
            studentCount: studentDetails.length,
            mentor: team.mentor || null,
            progress: {
              percentage: progress.percentage,
              status: progress.status,
              description: progress.description,
              updatedAt: progress.updatedAt
            },
            createdAt: team.createdAt,
            updatedAt: team.updatedAt
          };
        } catch (error) {
          console.error('[BACKEND] Error processing team:', team._id, error);
          return null;
        }
      })
    );

    // Filter out null results
    let filteredTeams = teamsWithDetails.filter(t => t !== null);

    console.log('[BACKEND] Teams after filtering:', filteredTeams.length);

    // Sort teams
    const sortMultiplier = sortOrder === 'asc' ? 1 : -1;
    filteredTeams.sort((a, b) => {
      let compareA, compareB;

      switch (sortBy) {
        case 'progress':
          compareA = a.progress.percentage;
          compareB = b.progress.percentage;
          break;
        case 'name':
          compareA = a.name.toLowerCase();
          compareB = b.name.toLowerCase();
          break;
        case 'updatedAt':
          compareA = a.progress.updatedAt ? new Date(a.progress.updatedAt).getTime() : 0;
          compareB = b.progress.updatedAt ? new Date(b.progress.updatedAt).getTime() : 0;
          break;
        default:
          compareA = a.progress.percentage;
          compareB = b.progress.percentage;
      }

      if (compareA < compareB) return -1 * sortMultiplier;
      if (compareA > compareB) return 1 * sortMultiplier;
      return 0;
    });

    // Calculate statistics
    const stats = {
      totalTeams: filteredTeams.length,
      completedTeams: filteredTeams.filter(t => t.progress.status === 'Completed').length,
      inProgressTeams: filteredTeams.filter(t => t.progress.status === 'In Progress').length,
      notStartedTeams: filteredTeams.filter(t => t.progress.status === 'Not Started').length,
      averageProgress: filteredTeams.length > 0 
        ? (filteredTeams.reduce((sum, t) => sum + t.progress.percentage, 0) / filteredTeams.length).toFixed(2)
        : 0,
      topTeams: filteredTeams.slice(0, 5).map(t => ({
        _id: t._id,
        name: t.name,
        progress: t.progress.percentage,
        status: t.progress.status
      }))
    };

    res.status(200).json({
      success: true,
      stats,
      teams: filteredTeams,
      filters: {
        hackathonId,
        branch: branch || 'all',
        college: college || 'all'
      }
    });

  } catch (error) {
    console.error('[BACKEND] Error fetching all teams progress:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

/**
 * GET /teams/progress/leaderboard - Get top teams by progress
 * Query params:
 *   - hackathonId (required)
 *   - limit (default: 10)
 *   - branch, college (optional filters)
 */
router.get('/teams/progress/leaderboard', authenticateToken, async (req, res) => {
  try {
    const { 
      hackathonId, 
      limit = 10,
      branch,
      college
    } = req.query;

    console.log('[BACKEND] Fetching leaderboard');

    if (!hackathonId) {
      return res.status(400).json({ 
        message: 'hackathonId is required' 
      });
    }

    // Reuse the all teams endpoint logic
    req.query.sortBy = 'progress';
    req.query.sortOrder = 'desc';

    // Get all teams with filters
    const teams = await HackTeam.find({ hackathon: hackathonId })
      .populate('mentor', 'name email')
      .lean();

    const progresses = await TeamProgress.find({ hackathonId })
      .lean();

    const progressMap = {};
    progresses.forEach(p => {
      progressMap[p.teamId.toString()] = p;
    });

    const teamsWithDetails = await Promise.all(
      teams.map(async (team) => {
        try {
          const hackReg = await HackRegister.findOne({
            hackathon: hackathonId,
            'students._id': { $in: team.students }
          }).populate('students.student');

          if (!hackReg) return null;

          const studentDetails = [];
          let teamLeadDetails = null;

          for (const regId of team.students) {
            const regEntry = hackReg.students.id(regId);
            if (regEntry && regEntry.student) {
              const studentInfo = {
                _id: regEntry.student._id,
                name: regEntry.student.name,
                branch: regEntry.student.branch,
                college: regEntry.student.college,
                year: regEntry.student.currentYear
              };

              studentDetails.push(studentInfo);

              if (team.teamLead && regId.toString() === team.teamLead.toString()) {
                teamLeadDetails = studentInfo;
              }
            }
          }

          // Apply filters
          if (branch && !studentDetails.some(s => s.branch === branch)) return null;
          if (college && !studentDetails.some(s => s.college === college)) return null;

          const progress = progressMap[team._id.toString()] || {
            percentage: 0,
            status: 'Not Started',
            updatedAt: null
          };

          // Only include teams with progress > 0 for leaderboard
          if (progress.percentage === 0) return null;

          return {
            rank: 0, // Will be set after sorting
            _id: team._id,
            name: team.name,
            teamLead: teamLeadDetails,
            studentCount: studentDetails.length,
            mentor: team.mentor ? {
              _id: team.mentor._id,
              name: team.mentor.name
            } : null,
            progress: {
              percentage: progress.percentage,
              status: progress.status,
              updatedAt: progress.updatedAt
            }
          };
        } catch (error) {
          console.error('[BACKEND] Error processing team:', error);
          return null;
        }
      })
    );

    // Filter and sort
    let leaderboard = teamsWithDetails
      .filter(t => t !== null)
      .sort((a, b) => {
        // Sort by percentage (descending)
        if (b.progress.percentage !== a.progress.percentage) {
          return b.progress.percentage - a.progress.percentage;
        }
        // If same percentage, sort by update time (more recent first)
        const aTime = a.progress.updatedAt ? new Date(a.progress.updatedAt).getTime() : 0;
        const bTime = b.progress.updatedAt ? new Date(b.progress.updatedAt).getTime() : 0;
        return bTime - aTime;
      });

    // Add ranks
    leaderboard.forEach((team, index) => {
      team.rank = index + 1;
    });

    // Limit results
    const topTeams = leaderboard.slice(0, parseInt(limit));

    res.status(200).json({
      success: true,
      leaderboard: topTeams,
      totalTeamsWithProgress: leaderboard.length,
      filters: {
        hackathonId,
        branch: branch || 'all',
        college: college || 'all'
      }
    });

  } catch (error) {
    console.error('[BACKEND] Error fetching leaderboard:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

/**
 * GET /teams/progress/statistics - Get progress statistics
 */
router.get('/teams/progress/statistics', authenticateToken, async (req, res) => {
  try {
    const { hackathonId } = req.query;

    if (!hackathonId) {
      return res.status(400).json({ 
        message: 'hackathonId is required' 
      });
    }

    const teams = await HackTeam.find({ hackathon: hackathonId });
    const progresses = await TeamProgress.find({ hackathonId });

    const progressMap = {};
    progresses.forEach(p => {
      progressMap[p.teamId.toString()] = p.percentage;
    });

    // Calculate statistics by branch, college
    const statsByBranch = {};
    const statsByCollege = {};

    for (const team of teams) {
      const hackReg = await HackRegister.findOne({
        hackathon: hackathonId,
        'students._id': { $in: team.students }
      }).populate('students.student');

      if (!hackReg) continue;

      const progress = progressMap[team._id.toString()] || 0;

      for (const regId of team.students) {
        const regEntry = hackReg.students.id(regId);
        if (regEntry && regEntry.student) {
          const student = regEntry.student;

          // By branch
          if (!statsByBranch[student.branch]) {
            statsByBranch[student.branch] = { count: 0, totalProgress: 0 };
          }
          statsByBranch[student.branch].count++;
          statsByBranch[student.branch].totalProgress += progress;

          // By college
          if (!statsByCollege[student.college]) {
            statsByCollege[student.college] = { count: 0, totalProgress: 0 };
          }
          statsByCollege[student.college].count++;
          statsByCollege[student.college].totalProgress += progress;
        }
      }
    }

    // Calculate averages
    const formatStats = (stats) => {
      return Object.entries(stats).map(([key, value]) => ({
        category: key,
        teamCount: value.count,
        averageProgress: (value.totalProgress / value.count).toFixed(2)
      }));
    };

    res.status(200).json({
      success: true,
      totalTeams: teams.length,
      teamsWithProgress: progresses.length,
      byBranch: formatStats(statsByBranch),
      byCollege: formatStats(statsByCollege)
    });

  } catch (error) {
    console.error('[BACKEND] Error fetching statistics:', error);
    res.status(500).json({ 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

module.exports = router;