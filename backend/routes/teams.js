const express = require('express');
const router = express.Router();
const { Student, Mentor } = require('../models/roles');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errorHandler');
const Team = require('../models/teams');

const MAX_TEAM_SIZE = 4;

// Get my team - OPTIMIZED
router.get('/myteam', authenticateToken, asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const team = await Team.findOne({ students: userId })
    .populate('mentor', 'name email')
    .populate('students', 'name email rollNo')
    .populate('teamLead', 'name email rollNo')
    .lean();

  if (!team) {
    return res.status(404).json({ 
      success: false,
      message: 'No team found' 
    });
  }

  res.json({
    success: true,
    data: team,
  });
}));

// Search students - OPTIMIZED
router.get('/students/search', asyncHandler(async (req, res) => {
  const { query } = req.query;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Query must be at least 2 characters'
    });
  }

  // Single consolidated query with regex
  const students = await Student.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } },
      { rollNo: { $regex: query, $options: 'i' } },
    ],
  })
    .select('_id name email rollNo github')
    .lean()
    .limit(50);

  // Get teams for these students in one query
  const studentIds = students.map(s => s._id);
  const teams = await Team.find({ students: { $in: studentIds } })
    .select('students')
    .lean();

  const studentsInTeamsSet = new Set(
    teams.flatMap(team => team.students.map(id => id.toString()))
  );

  const result = students.map(student => ({
    ...student,
    inTeam: studentsInTeamsSet.has(student._id.toString()),
  }));

  res.json({
    success: true,
    data: result,
  });
}));

// Search mentors - OPTIMIZED
router.get('/mentors/search', asyncHandler(async (req, res) => {
  const { query } = req.query;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Query must be at least 2 characters'
    });
  }

  const mentors = await Mentor.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { email: { $regex: query, $options: 'i' } },
    ],
  })
    .select('_id name email github')
    .lean()
    .limit(50);

  res.json({
    success: true,
    data: mentors,
  });
}));

// Create a team (admin) - OPTIMIZED
router.post('/', asyncHandler(async (req, res) => {
  const { name, studentIds, mentorId } = req.body;

  // Validation
  if (!name || !studentIds || studentIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Team name and at least one student are required'
    });
  }

  if (studentIds.length > MAX_TEAM_SIZE) {
    return res.status(400).json({
      success: false,
      message: `Team size cannot exceed ${MAX_TEAM_SIZE} members`
    });
  }

  if (!mongoose.Types.ObjectId.isValid(mentorId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid mentor ID'
    });
  }

  for (const id of studentIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID'
      });
    }
  }

  // Check team name uniqueness
  const existingTeam = await Team.findOne({ name }).lean();
  if (existingTeam) {
    return res.status(409).json({
      success: false,
      message: 'Team name already exists'
    });
  }

  // Verify students exist
  const students = await Student.find({ _id: { $in: studentIds } })
    .select('_id')
    .lean();
  if (students.length !== studentIds.length) {
    return res.status(400).json({
      success: false,
      message: 'One or more selected students do not exist'
    });
  }

  // Check if students are already in teams
  const teamsWithStudents = await Team.find({ students: { $in: studentIds } })
    .select('students')
    .lean();
  
  if (teamsWithStudents.length > 0) {
    return res.status(409).json({
      success: false,
      message: 'One or more students are already in a team'
    });
  }

  // Verify mentor exists
  const mentor = await Mentor.findById(mentorId).select('_id').lean();
  if (!mentor) {
    return res.status(404).json({
      success: false,
      message: 'Mentor not found'
    });
  }

  // Create team
  const randomTeamLeadId = studentIds[Math.floor(Math.random() * studentIds.length)];
  const newTeam = new Team({
    name,
    students: studentIds,
    teamLead: randomTeamLeadId,
    mentor: mentorId,
  });

  await newTeam.save();

  // Populate for response
  await newTeam.populate([
    { path: 'students', select: 'name email rollNo github' },
    { path: 'mentor', select: 'name email github' },
    { path: 'teamLead', select: 'name email rollNo github' }
  ]);

  res.status(201).json({
    success: true,
    message: 'Team created successfully',
    data: newTeam,
  });
}));

// Create a team (mentor) - OPTIMIZED
router.post('/mentor/teams', asyncHandler(async (req, res) => {
  const { name, studentIds, mentorId } = req.body;

  if (!name || !studentIds || studentIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Team name and at least one student are required'
    });
  }

  if (studentIds.length > MAX_TEAM_SIZE) {
    return res.status(400).json({
      success: false,
      message: `Team size cannot exceed ${MAX_TEAM_SIZE} members`
    });
  }

  // Verify students exist
  const students = await Student.find({ _id: { $in: studentIds } })
    .select('_id')
    .lean();
  if (students.length !== studentIds.length) {
    return res.status(400).json({
      success: false,
      message: 'One or more selected students do not exist'
    });
  }

  // Check if students are already in teams
  const teamsWithStudents = await Team.find({ students: { $in: studentIds } })
    .select('students')
    .lean();
  
  if (teamsWithStudents.length > 0) {
    return res.status(409).json({
      success: false,
      message: 'One or more students are already in a team'
    });
  }

  // Verify mentor exists (if provided)
  if (mentorId && !mongoose.Types.ObjectId.isValid(mentorId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid mentor ID'
    });
  }

  if (mentorId) {
    const mentor = await Mentor.findById(mentorId).select('_id').lean();
    if (!mentor) {
      return res.status(404).json({
        success: false,
        message: 'Mentor not found'
      });
    }
  }

  const newTeam = new Team({
    name,
    students: studentIds,
    mentor: mentorId,
    teamLead: studentIds[0],
  });

  await newTeam.save();
  await newTeam.populate([
    { path: 'students', select: 'name email rollNo github' },
    { path: 'mentor', select: 'name email github' },
    { path: 'teamLead', select: 'name email rollNo github' }
  ]);

  res.status(201).json({
    success: true,
    message: 'Team created successfully',
    data: newTeam,
  });
}));

// Get all teams - OPTIMIZED
router.get('/', asyncHandler(async (req, res) => {
  const teams = await Team.find()
    .populate('students', 'name email rollNo github')
    .populate('mentor', 'name email github')
    .populate('teamLead', 'name email rollNo')
    .lean()
    .limit(1000);

  res.json({
    success: true,
    data: teams,
  });
}));

// Get single team by ID - OPTIMIZED
router.get('/:teamId', asyncHandler(async (req, res) => {
  const { teamId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid team ID'
    });
  }

  const team = await Team.findById(teamId)
    .populate('students', 'name email rollNo github')
    .populate('mentor', 'name email github')
    .populate('teamLead', 'name email rollNo')
    .lean();

  if (!team) {
    return res.status(404).json({
      success: false,
      message: 'Team not found'
    });
  }

  res.json({
    success: true,
    data: team,
  });
}));

// Update team - OPTIMIZED
router.put('/:teamId', asyncHandler(async (req, res) => {
  const { teamId } = req.params;
  const { name, studentIds, mentorId } = req.body;

  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid team ID'
    });
  }

  const team = await Team.findById(teamId);
  if (!team) {
    return res.status(404).json({
      success: false,
      message: 'Team not found'
    });
  }

  // Check if name is unique (excluding current team)
  if (name && name !== team.name) {
    const existingTeam = await Team.findOne({ name, _id: { $ne: teamId } }).lean();
    if (existingTeam) {
      return res.status(409).json({
        success: false,
        message: 'Team name already exists'
      });
    }
  }

  // Verify students if provided
  if (studentIds) {
    if (studentIds.length > MAX_TEAM_SIZE) {
      return res.status(400).json({
        success: false,
        message: `Team size cannot exceed ${MAX_TEAM_SIZE} members`
      });
    }

    const students = await Student.find({ _id: { $in: studentIds } })
      .select('_id')
      .lean();
    if (students.length !== studentIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more selected students do not exist'
      });
    }

    // Check if students are in other teams
    const teamsWithStudents = await Team.find({
      _id: { $ne: teamId },
      students: { $in: studentIds },
    }).lean();

    if (teamsWithStudents.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'One or more students are already in another team'
      });
    }
  }

  // Verify mentor if provided
  if (mentorId) {
    if (!mongoose.Types.ObjectId.isValid(mentorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mentor ID'
      });
    }

    const mentor = await Mentor.findById(mentorId).select('_id').lean();
    if (!mentor) {
      return res.status(404).json({
        success: false,
        message: 'Mentor not found'
      });
    }

    team.mentor = mentorId;
  }

  if (name) team.name = name;
  if (studentIds) team.students = studentIds;

  await team.save();

  await team.populate([
    { path: 'students', select: 'name email rollNo github' },
    { path: 'mentor', select: 'name email github' },
    { path: 'teamLead', select: 'name email rollNo' }
  ]);

  res.json({
    success: true,
    message: 'Team updated successfully',
    data: team,
  });
}));

// Delete team - OPTIMIZED
router.delete('/:teamId', asyncHandler(async (req, res) => {
  const { teamId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid team ID'
    });
  }

  const team = await Team.findByIdAndDelete(teamId);

  if (!team) {
    return res.status(404).json({
      success: false,
      message: 'Team not found'
    });
  }

  res.json({
    success: true,
    message: 'Team deleted successfully',
  });
}));

module.exports = router;
