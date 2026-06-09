const router = require('express').Router();
const Team = require('../models/teams');
const { authenticateToken } = require('../middleware/auth');
// const { checkMentorRole } = require('./middleware/mentorAuth');
const TEAM_SIZE_LIMIT = 4;

// middleware/mentorAuth.js
const checkMentorRole = async (req, res, next) => {
    try {
        // Assuming you have a role field in your user model
        if (req.user.role !== 'mentor') {
            return res.status(403).json({ 
                error: 'Access denied. Mentor privileges required.' 
            });
        }
        next();
    } catch (error) {
        res.status(500).json({ error: 'Error checking mentor status' });
    }
};

module.exports = { checkMentorRole };


// Get all teams without mentors (for mentors only)
router.get('/available-teams', authenticateToken, checkMentorRole, async (req, res) => {
    try {
        const teamsWithoutMentor = await Team.find({ 
            mentor: null 
        })
        .populate('students', 'name email rollNo college')
        .populate('teamLead', 'name email rollNo college');
        res.json({
            success: true,
            teams: teamsWithoutMentor.map(team => ({
                id: team._id,
                name: team.name,
                members: team.students,
                teamLead: team.teamLead,
                vacancies: TEAM_SIZE_LIMIT - team.students.length,
                createdAt: team.createdAt
            }))
        });
    } catch (error) {
        console.error('Error fetching available teams:', error.message);
        res.status(500).json({ error: 'Failed to fetch available teams' });
    }
});

// Assign mentor to a team (for mentors only)
router.post('/assign-team/:teamId', authenticateToken, checkMentorRole, async (req, res) => {
    try {
        const { teamId } = req.params;
        const mentorId = req.user.userId;

        // Check if team exists and has no mentor
        const team = await Team.findOne({ 
            _id: teamId,
            mentor: null
        });

        if (!team) {
            return res.status(404).json({ 
                error: 'Team not found or already has a mentor' 
            });
        }

        // Assign mentor to team
        team.mentor = mentorId;
        await team.save();

        res.json({
            success: true,
            message: 'Successfully assigned as mentor',
            teamDetails: {
                id: team._id,
                name: team.name,
                members: team.students,
                teamLead: team.teamLead,
                mentor: mentorId
            }
        });
    } catch (error) {
        console.error('Error assigning mentor:', error.message);
        res.status(500).json({ error: 'Failed to assign mentor' });
    }
});

// Get mentor's assigned teams (for mentors only)
router.get('/my-mentored-teams', authenticateToken, checkMentorRole, async (req, res) => {
    try {
        const mentorId = req.user.userId;
        
        const menteredTeams = await Team.find({ 
            mentor: mentorId 
        })
        .populate('students', 'name email rollNo college')
        .populate('teamLead', 'name email rollNo college');

        res.json({
            success: true,
            teams: menteredTeams.map(team => ({
                id: team._id,
                name: team.name,
                members: team.students,
                teamLead: team.teamLead,
                createdAt: team.createdAt
            }))
        });
    } catch (error) {
        console.error('Error fetching mentored teams:', error.message);
        res.status(500).json({ error: 'Failed to fetch mentored teams' });
    }
});

module.exports = router;