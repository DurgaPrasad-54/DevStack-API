const express = require('express');
const router = express.Router();
const { Student, Mentor } = require('../models/roles');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const Team = require('../models/teams');

// Add this constant at the top of your routes file
const MAX_TEAM_SIZE = 4;

// Update the myteam route
router.get('/myteam', authenticateToken, async (req, res) => {
  try {
    const { userId, role } = req.user;

    const team = await Team.findOne({
      students: userId,
    }).populate('mentor', 'name email');

    // Debug log
    console.log('Found team:', team);

    if (!team) {
      return res.status(404).json({ message: 'No team found' });
    }

    // Make sure to send the full team data
    res.json({
      _id: team._id,
      name: team.name,
      mentor: team.mentor,
      students: team.students,
    });
  } catch (error) {
    console.error('Error in /myteam route:', error);
    res.status(500).json({
      error: 'Failed to fetch team details',
      details: error.message,
    });
  }
});

// Search students
router.get('/students/search', async (req, res) => {
  try {
    const { query } = req.query;
    const students = await Student.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { rollNo: { $regex: query, $options: 'i' } },
      ],
    }).select('_id name email rollNo github');
    // Check which students are already in a team
    const studentIds = students.map((student) => student._id);
    const teams = await Team.find({ students: { $in: studentIds } }).select(
      'students'
    );

    // Create a set of student IDs that are already in teams
    const studentsInTeams = new Set(
      teams.flatMap((team) => team.students.map((id) => id.toString()))
    );

    // Append the "inTeam" field to each student indicating whether they're already in a team
    const result = students.map((student) => ({
      ...student.toObject(),
      inTeam: studentsInTeams.has(student._id.toString()),
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search students' });
  }
});

// Search mentors
router.get('/mentors/search', async (req, res) => {
  try {
    const { query } = req.query;
    const mentors = await Mentor.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
      ],
    }).select('_id name email github');
    res.json(mentors);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search mentors' });
  }
});

// Create a team from admin
router.post('/', async (req, res) => {
  try {
    const { name, studentIds, mentorId } = req.body;

    // Check team size
    if (studentIds.length > MAX_TEAM_SIZE) {
      return res.status(400).json({
        error: `Team size cannot exceed ${MAX_TEAM_SIZE} members`,
      });
    }

    // Rest of your existing validation logic...
    const existingTeam = await Team.findOne({ name });
    if (existingTeam) {
      return res.status(400).json({ error: 'Team name already exists' });
    }

    const students = await Student.find({ _id: { $in: studentIds } });
    if (students.length !== studentIds.length) {
      return res
        .status(400)
        .json({ error: 'One or more selected students do not exist' });
    }

    const studentsInTeam = await Team.find({ students: { $in: studentIds } });
    if (studentsInTeam.length > 0) {
      const conflictingStudents = students.filter((s) =>
        studentsInTeam.some((team) => team.students.includes(s._id))
      );
      return res.status(400).json({
        error: 'One or more students are already in a team',
        conflictingStudents: conflictingStudents.map((s) => ({
          name: s.name,
          rollNo: s.rollNo,
        })),
      });
    }

    const mentor = await Mentor.findById(mentorId);
    if (!mentor) {
      return res.status(400).json({ error: 'Selected mentor does not exist' });
    }

    // Randomly select a team lead from the students
    const randomIndex = Math.floor(Math.random() * studentIds.length);
    const randomTeamLeadId = studentIds[randomIndex];

    const newTeam = new Team({
      name,
      students: studentIds,
      teamLead: randomTeamLeadId, // Set the randomly selected team lead
      mentor: mentorId,
    });

    await newTeam.save();

    // Update population to include teamLead
    await newTeam.populate('students', 'name email rollNo github');
    await newTeam.populate('mentor', 'name email github');
    await newTeam.populate('teamLead', 'name email rollNo github');

    res.status(201).json(newTeam);
  } catch (error) {
    console.error('Team creation error:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});
// Create a team from mentor
router.post('/teams', async (req, res) => {
  try {
    const { name, studentIds, mentorId } = req.body;

    // Validate input
    if (!name || !studentIds || studentIds.length === 0) {
      return res
        .status(400)
        .json({ error: 'Team name and at least one student are required' });
    }

    // Check if students exist and are not in a team
    const students = await Student.find({ _id: { $in: studentIds } });
    if (students.length !== studentIds.length) {
      return res
        .status(400)
        .json({ error: 'One or more selected students do not exist' });
    }

    if (studentIds.length > MAX_TEAM_SIZE) {
      return res.status(400).json({
        error: `Team size cannot exceed ${MAX_TEAM_SIZE} members`,
      });
    }

    const studentsInTeam = await Team.find({ students: { $in: studentIds } });
    if (studentsInTeam.length > 0) {
      const conflictingStudents = students.filter((s) =>
        studentsInTeam.some((team) => team.students.includes(s._id))
      );
      return res.status(400).json({
        error: 'One or more students are already in a team',
        conflictingStudents: conflictingStudents.map((s) => ({
          name: s.name,
          rollNo: s.rollNo,
        })),
      });
    }

    // Automatically assign the first student as the team lead
    const teamLeadId = studentIds[0];

    // Check if mentor exists (if provided)
    let mentor;
    if (mentorId) {
      mentor = await Mentor.findById(mentorId);
      if (!mentor) {
        return res
          .status(400)
          .json({ error: 'Selected mentor does not exist' });
      }
    }

    // Create and save new team
    const newTeam = new Team({
      name,
      students: studentIds,
      mentor: mentorId,
      teamLead: teamLeadId, // Assign team lead automatically
    });

    await newTeam.save();

    // Populate student and mentor details
    await newTeam.populate('students', 'name email rollNo github');
    await newTeam.populate('mentor', 'name email github');
    await newTeam.populate('teamLead', 'name email rollNo github'); // Populate team lead info

    res.status(201).json(newTeam);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// Get all teams
router.get('/', async (req, res) => {
  try {
    const teams = await Team.find()
      .populate('students', 'name email rollNo github')
      .populate('mentor', 'name email github');
    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Get a single team by ID
router.get('/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const team = await Team.findById(teamId)
      .populate('students', 'name email rollNo github')
      .populate('mentor', 'name email github');

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json(team);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// Update team
router.put('/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { name, studentIds, mentorId } = req.body;

    // Check if team name already exists (excluding the current team)
    const existingTeam = await Team.findOne({ name, _id: { $ne: teamId } });
    if (existingTeam) {
      return res.status(400).json({ error: 'Team name already exists' });
    }

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const students = await Student.find({ _id: { $in: studentIds } });
    if (students.length !== studentIds.length) {
      return res
        .status(400)
        .json({ error: 'One or more selected students do not exist' });
    }

    const studentsInOtherTeams = await Team.find({
      _id: { $ne: teamId },
      students: { $in: studentIds },
    });

    if (studentsInOtherTeams.length > 0) {
      const conflictingStudents = students.filter((s) =>
        studentsInOtherTeams.some((team) => team.students.includes(s._id))
      );
      return res.status(400).json({
        error: 'One or more students are already in another team',
        conflictingStudents: conflictingStudents.map((s) => ({
          name: s.name,
          rollNo: s.rollNo,
        })),
      });
    }

    const mentor = await Mentor.findById(mentorId);
    if (!mentor) {
      return res.status(400).json({ error: 'Selected mentor does not exist' });
    }

    team.name = name;
    team.students = studentIds;
    team.mentor = mentorId;

    await team.save();

    await team.populate('students', 'name email rollNo github');
    await team.populate('mentor', 'name email github');

    res.json(team);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// Delete team
router.delete('/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await Team.findById(teamId);

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    // Delete the team
    await Team.findByIdAndDelete(teamId);

    // Return success message
    res.json({ message: 'Team deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete team.' });
  }
});

module.exports = router;
