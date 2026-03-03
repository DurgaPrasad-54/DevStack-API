const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken } = require('../../middleware/auth');
const HackTeams = require('../Models/hackteam');
const Hackathon = require('../Models/HackathonAdmin');
const HackRegister = require('../Models/hack-reg');
const HackMentor = require('../Models/Hackmentor');
const { Student, Mentor } = require('../../models/roles');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get team size limits for a hackathon
 */
async function getTeamSizeLimits(hackathonId) {
  const hackathon = await Hackathon.findById(hackathonId);
  if (!hackathon) {
    return { minTeam: 1, maxTeam: 4 }; // Default fallback
  }
  return {
    minTeam: hackathon.minteam || 1,
    maxTeam: hackathon.maxteam || 4
  };
}

/**
 * Populate team with full student and mentor details
 */
async function populateTeamDetails(team) {
  await team.populate({
    path: 'students',
    populate: { path: 'student' }
  });
  await team.populate({
    path: 'teamLead',
    populate: { path: 'student' }
  });

  const teamLeadDetails = team.teamLead && team.teamLead.student ? team.teamLead.student : null;

  let mentorDetails = null;
  if (team.mentor) {
    try {
      mentorDetails = await Mentor.findById(team.mentor)
        .select('name email github linkedin');
    } catch (error) {
      console.error('Error populating mentor:', error);
    }
  }

  const mappedStudents = team.students
    .map(regEntry => {
      if (!regEntry || !regEntry.student) return null;
      const student = regEntry.student;
      return {
        _id: student._id,
        registrationId: regEntry._id,
        name: student.name,
        email: student.email,
        rollNo: student.rollNo,
        college: student.college,
        branch: student.branch,
        github: student.github,
        linkedin: student.linkedin
      };
    })
    .filter(Boolean);

  return {
    _id: team._id,
    name: team.name,
    hackathon: team.hackathon,
    teamLead: teamLeadDetails ? {
      _id: teamLeadDetails._id,
      name: teamLeadDetails.name,
      email: teamLeadDetails.email,
      rollNo: teamLeadDetails.rollNo,
      college: teamLeadDetails.college,
      branch: teamLeadDetails.branch,
      github: teamLeadDetails.github,
      linkedin: teamLeadDetails.linkedin
    } : null,
    students: mappedStudents,
    mentor: mentorDetails ? {
      _id: mentorDetails._id,
      name: mentorDetails.name,
      email: mentorDetails.email,
      github: mentorDetails.github || null,
      linkedin: mentorDetails.linkedin || null
    } : null,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  };
}

/**
 * Get full student info from registration subdoc ID
 */
async function getStudentInfoFromRegId(hackathonId, regId) {
  const hackReg = await HackRegister.findOne({ hackathon: hackathonId })
    .populate('students.student');
  if (!hackReg) return null;
  
  const regEntry = hackReg.students.id(regId);
  if (!regEntry || !regEntry.student) return null;
  
  return {
    _id: regEntry.student._id,
    name: regEntry.student.name,
    email: regEntry.student.email,
    rollNo: regEntry.student.rollNo,
    college: regEntry.student.college,
    currentYear: regEntry.student.currentYear, 
    branch: regEntry.student.branch,
    github: regEntry.student.github,
    linkedin: regEntry.student.linkedin
  };
}

/**
 * Get all students for a team
 */
async function getTeamStudents(hackathonId, studentRegIds) {
  const hackReg = await HackRegister.findOne({ hackathon: hackathonId })
    .populate('students.student');
  if (!hackReg) return [];
  
  return studentRegIds.map(regId => {
    const regEntry = hackReg.students.id(regId);
    if (!regEntry || !regEntry.student) return null;
    return {
      _id: regEntry.student._id,
      name: regEntry.student.name,
      email: regEntry.student.email,
      rollNo: regEntry.student.rollNo,
      college: regEntry.student.college,
      currentYear: regEntry.student.currentYear, 
      branch: regEntry.student.branch,
      github: regEntry.student.github,
      linkedin: regEntry.student.linkedin
    };
  }).filter(Boolean);
}

/**
 * Map student IDs to registration IDs
 */
function mapStudentIdsToRegistrationIds(studentIds, hackReg) {
  return studentIds.map(id => {
    const isRegistrationId = hackReg.students.some(s => s._id.toString() === id);
    if (isRegistrationId) {
      return id;
    }
    
    const regEntry = hackReg.students.find(s => s.student.toString() === id);
    if (regEntry) {
      return regEntry._id.toString();
    }
    
    return id;
  });
}

// ============================================================================
// ROUTES - AUTHENTICATION & USER DATA
// ============================================================================

/**
 * GET /myteam - Get authenticated user's team
 */
router.get('/myteam', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.user;
    console.log('[DEBUG] /myteam userId:', userId);

    const hackRegEntry = await HackRegister.findOne({
      'students.student': userId
    });
    console.log('[DEBUG] /myteam hackRegEntry:', hackRegEntry ? hackRegEntry._id : null);

    if (!hackRegEntry) {
      console.log('[DEBUG] /myteam: No registration found');
      return res.status(404).json({ message: 'No registration found' });
    }

    const studentRegEntry = hackRegEntry.students.find(s =>
      s.student.toString() === userId
    );
    console.log('[DEBUG] /myteam studentRegEntry:', studentRegEntry ? studentRegEntry._id : null);

    if (!studentRegEntry) {
      console.log('[DEBUG] /myteam: Registration entry not found');
      return res.status(404).json({ message: 'Registration entry not found' });
    }

    const team = await HackTeams.findOne({
      students: studentRegEntry._id
    });
    console.log('[DEBUG] /myteam team:', team ? team._id : null);

    if (!team) {
      console.log('[DEBUG] /myteam: No team found');
      return res.status(404).json({ message: 'No team found' });
    }

    const populatedTeam = await populateTeamDetails(team);
    res.json(populatedTeam);
  } catch (error) {
    console.error('Error in /myteam route:', error);
    res.status(500).json({
      error: 'Failed to fetch team details',
      details: error.message,
    });
  }
});

// ============================================================================
// ROUTES - REFERENCE DATA
// ============================================================================

/**
 * GET /hackathons/all - Get all hackathons with team size limits
 */
router.get('/hackathons/all', async (req, res) => {
  try {
    const hackathons = await Hackathon.find({}, 'hackathonname _id branch status minteam maxteam');
    res.json(hackathons);
  } catch (err) {
    console.error('Error fetching hackathons:', err);
    res.status(500).json({ error: 'Failed to fetch hackathons' });
  }
});

router.get('/hackathons', async (req, res) => {
  try {
    const { year, college } = req.query;
    
    console.log('\n=== GET /hackathons REQUEST ===');
    console.log('Query params:', { year, college });
    
    let filter = {};
    
    // Build filter based on what fields exist in your schema
    if (year) {
      filter.year = year;
    }
    
    if (college) {
      // Try both possible field names
      // This handles if your schema has 'colleges' (array) OR 'college' (string)
      filter.$or = [
        { colleges: { $in: [college] } },  // If using array field
        { college: college }                // If using single string field
      ];
    }
    
    console.log('MongoDB filter:', JSON.stringify(filter, null, 2));
    
    // Try to find hackathons
    const hackathons = await Hackathon.find(filter)
      .select('hackathonname _id year colleges college minteam maxteam status')
      .lean();
    
    console.log(`Found ${hackathons.length} matching hackathons`);
    
    if (hackathons.length > 0) {
      console.log('First matching hackathon:', JSON.stringify(hackathons[0], null, 2));
    } else {
      console.log('No hackathons found with current filter');
      
      // Check if hackathons exist without filter
      const totalCount = await Hackathon.countDocuments({});
      console.log(`Total hackathons in database: ${totalCount}`);
      
      if (year) {
        const yearCount = await Hackathon.countDocuments({ year });
        console.log(`Hackathons with year="${year}": ${yearCount}`);
      }
    }
    
    res.json({
      success: true,
      data: hackathons,
      count: hackathons.length,
      requestedFilter: { year, college }
    });
  } catch (error) {
    console.error('Error fetching hackathons:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching hackathons',
      error: error.message
    });
  }
});



/**
 * GET /branches/all - Get all branches for dropdown
 */
router.get('/branches/all', (req, res) => {
  res.json([
    'Artificial Intelligence (AI)',
    'Artificial Intelligence and Machine Learning (CSM)',
    'Artificial Intelligence and Data Science (AID)',
    'Cyber Security (CSC)',
    'Data Science (CSD)'
  ]);
});

// ============================================================================
// ROUTES - SEARCH
// ============================================================================

/**
 * GET /students/search - Search approved students by hackathon and branch
 */
// router.get('/students/search', async (req, res) => {
//   try {
//     const { hackathonId, branch, editingTeamId } = req.query;
    
//     if (!hackathonId) {
//       return res.status(400).json({ error: 'hackathonId required' });
//     }

//     const hackReg = await HackRegister.findOne({ hackathon: hackathonId })
//       .populate('students.student');
    
//     if (!hackReg) {
//       return res.json([]);
//     }

//     const teamsInHackathon = await HackTeams.find({ hackathon: hackathonId });
//     const regIdsInTeams = new Set();
    
//     teamsInHackathon.forEach(team => {
//       if (!editingTeamId || team._id.toString() !== editingTeamId) {
//         team.students.forEach(regId => regIdsInTeams.add(regId.toString()));
//       }
//     });

//     const students = hackReg.students
//       .filter(s => 
//         s.status === 'approved' &&
//         s.student &&
//         (!branch || s.student.branch === branch)
//       )
//       .map(regEntry => ({
//         _id: regEntry._id,
//         studentId: regEntry.student._id,
//         name: regEntry.student.name,
//         email: regEntry.student.email,
//         rollNo: regEntry.student.rollNo,
//         college: regEntry.student.college,
//         branch: regEntry.student.branch,
//         github: regEntry.student.github || null,
//         linkedin: regEntry.student.linkedin || null,
//         inTeam: regIdsInTeams.has(regEntry._id.toString())
//       }));

//     res.json(students);
//   } catch (err) {
//     console.error('Search students error:', err);
//     res.status(500).json({ error: 'Failed to search students' });
//   }
// });
router.get('/students/search', async (req, res) => {
  try {
    const { hackathonId, branch, editingTeamId, coordinatorYear, coordinatorCollege } = req.query;
    
    if (!hackathonId) {
      return res.status(400).json({ error: 'hackathonId required' });
    }

    console.log('Search students params:', { 
      hackathonId, 
      branch, 
      coordinatorYear, 
      coordinatorCollege,
      editingTeamId 
    });

    const hackReg = await HackRegister.findOne({ hackathon: hackathonId })
      .populate({
        path: 'students.student',
        // FIXED: Use currentYear instead of year
        select: 'name email rollNo department currentYear phone branch college github linkedin'
      });
    
    if (!hackReg) {
      console.log('No registration found for hackathon:', hackathonId);
      return res.json([]);
    }

    // Get teams to mark students already in teams
    const teamsInHackathon = await HackTeams.find({ hackathon: hackathonId });
    const regIdsInTeams = new Set();
    
    teamsInHackathon.forEach(team => {
      // Exclude current editing team's students
      if (!editingTeamId || team._id.toString() !== editingTeamId) {
        team.students.forEach(regId => regIdsInTeams.add(regId.toString()));
      }
    });

    let filteredCount = {
      total: hackReg.students.length,
      afterStatus: 0,
      afterYear: 0,
      afterCollege: 0,
      afterBranch: 0,
      final: 0
    };

    const students = hackReg.students
      .filter(s => {
        // Must be approved
        if (s.status !== 'approved') return false;
        filteredCount.afterStatus++;
        
        // Must have student data
        if (!s.student) return false;
        
        // CRITICAL: Filter by coordinator year - match student's currentYear
        if (coordinatorYear && s.student.currentYear !== coordinatorYear) {
          console.log(`❌ Filtering out ${s.student.name}: currentYear="${s.student.currentYear}" != coordinatorYear="${coordinatorYear}"`);
          return false;
        }
        filteredCount.afterYear++;
        
        // CRITICAL: Filter by coordinator college
        if (coordinatorCollege && s.student.college !== coordinatorCollege) {
          console.log(`❌ Filtering out ${s.student.name}: college="${s.student.college}" != coordinatorCollege="${coordinatorCollege}"`);
          return false;
        }
        filteredCount.afterCollege++;
        
        // Filter by branch if specified
        if (branch && s.student.branch !== branch) return false;
        filteredCount.afterBranch++;
        
        filteredCount.final++;
        console.log(`✅ Including ${s.student.name}: ${s.student.college} - ${s.student.currentYear} - ${s.student.branch || 'No branch'}`);
        return true;
      })
      .map(regEntry => ({
        _id: regEntry._id,
        studentId: regEntry.student._id,
        name: regEntry.student.name,
        email: regEntry.student.email,
        rollNo: regEntry.student.rollNo,
        college: regEntry.student.college,
        currentYear: regEntry.student.currentYear, // Use currentYear
        branch: regEntry.student.branch,
        github: regEntry.student.github || null,
        linkedin: regEntry.student.linkedin || null,
        inTeam: regIdsInTeams.has(regEntry._id.toString())
      }));

    console.log('Student filtering summary:', filteredCount);
    console.log(`📊 Returning ${students.length} students matching ${coordinatorCollege} - ${coordinatorYear}`);

    res.json(students);
  } catch (err) {
    console.error('Search students error:', err);
    res.status(500).json({ error: 'Failed to search students', details: err.message });
  }
});
/**
 * GET /mentors/search - Search approved mentors by hackathon
 */
router.get('/mentors/search', async (req, res) => {
  try {
    const { hackathonId } = req.query;
    
    if (!hackathonId) {
      return res.status(400).json({ error: 'hackathonId required' });
    }

    const hackMentor = await HackMentor.findOne({ hackathon: hackathonId });
    if (!hackMentor) {
      return res.json([]);
    }

    await hackMentor.populate('mentors.mentor');

    const mentorIds = hackMentor.mentors
      .filter(m => m.status === 'approved' && m.mentor)
      .map(m => m.mentor._id);

    const mentorDetails = await Mentor.find({ _id: { $in: mentorIds } })
      .select('name email github linkedin');

    const mentors = mentorDetails.map(mentor => ({
      _id: mentor._id,
      name: mentor.name,
      email: mentor.email,
      github: mentor.github || null,
      linkedin: mentor.linkedin || null
    }));

    res.json(mentors);
  } catch (err) {
    console.error('Search mentors error:', err);
    res.status(500).json({ error: 'Failed to search mentors' });
  }
});

// ============================================================================
// ROUTES - TEAM MANAGEMENT
// ============================================================================

/**
 * POST /teams/create - Create a new team
 */
router.post('/teams/create', async (req, res) => {
  try {
    const { teamName, hackathonId, studentIds, mentorId } = req.body;

    // Validation: Required fields
    if (!hackathonId) {
      return res.status(400).json({ error: 'hackathonId is required' });
    }
    if (!teamName || !teamName.trim()) {
      return res.status(400).json({ error: 'Team name is required' });
    }
    if (!studentIds || studentIds.length === 0) {
      return res.status(400).json({ error: 'At least one student is required' });
    }

    // Verify hackathon exists and get team size limits
    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({ error: 'Hackathon not found' });
    }

    const { minTeam, maxTeam } = await getTeamSizeLimits(hackathonId);
    console.log('Team size limits:', { minTeam, maxTeam });

    // Validation: Team size
    if (studentIds.length < minTeam) {
      return res.status(400).json({ 
        error: `Team must have at least ${minTeam} member(s)` 
      });
    }
    if (studentIds.length > maxTeam) {
      return res.status(400).json({ 
        error: `Team size cannot exceed ${maxTeam} members` 
      });
    }

    // Check uniqueness of team name per hackathon
    const existingTeam = await HackTeams.findOne({ 
      name: teamName.trim(), 
      hackathon: hackathon._id
    });
    if (existingTeam) {
      return res.status(400).json({ 
        error: `Team name "${teamName}" already exists for this hackathon. Please choose a different name.` 
      });
    }

    // Get hackathon registrations
    const hackReg = await HackRegister.findOne({ hackathon: hackathon._id });
    if (!hackReg) {
      return res.status(400).json({ 
        error: 'No registrations for this hackathon found' 
      });
    }

    // Map student IDs to registration IDs if needed
    const mappedStudentIds = mapStudentIdsToRegistrationIds(studentIds, hackReg);

    // Get all approved registration IDs
    const approvedRegIds = hackReg.students
      .filter(s => s.status === 'approved')
      .map(s => s._id.toString());

    // Validate all students are approved
    for (const sid of mappedStudentIds) {
      if (!approvedRegIds.includes(sid)) {
        return res.status(400).json({ 
          error: `Student with registration ID ${sid} is not approved for this hackathon` 
        });
      }
    }

    // Check that students are not already in other teams
    const teamsWithStudents = await HackTeams.find({ 
      hackathon: hackathon._id, 
      students: { $in: mappedStudentIds } 
    });

    if (teamsWithStudents.length > 0) {
      const conflictedStudentIds = new Set();
      teamsWithStudents.forEach(team => 
        team.students.forEach(sid => conflictedStudentIds.add(sid.toString()))
      );
      const conflictedStudents = mappedStudentIds.filter(id => 
        conflictedStudentIds.has(id)
      );

      return res.status(400).json({ 
        error: 'One or more students are already in another team for this hackathon', 
        conflictedStudents,
        message: 'Each student can only join one team per hackathon'
      });
    }

    // Verify mentor approval if provided
    if (mentorId) {
      const hackMentor = await HackMentor.findOne({ 
        hackathon: hackathon._id, 
        'mentors.mentor': mentorId, 
        'mentors.status': 'approved' 
      });
      if (!hackMentor) {
        return res.status(400).json({ 
          error: 'Selected mentor is not approved for this hackathon' 
        });
      }
    }

    // Create team
    const teamLead = mappedStudentIds[0];
    const newTeam = new HackTeams({
      name: teamName.trim(),
      hackathon: hackathon._id,
      students: mappedStudentIds,
      mentor: mentorId || null,
      teamLead,
    });

    await newTeam.save();

    const populatedTeam = await populateTeamDetails(newTeam);
    res.status(201).json(populatedTeam);
  } catch (error) {
    console.error('Create team error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        error: 'A team with this name already exists for this hackathon. Please choose a different name.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create team', 
      details: error.message 
    });
  }
});

/**
 * POST /create - Alias for /teams/create (backward compatibility)
 */
router.post('/create', async (req, res) => {
  req.url = '/teams/create';
  router.handle(req, res);
});

/**
 * PUT /teams/:teamId - Edit an existing team
 */
router.put('/teams/:teamId', async (req, res) => {
  try {
    const { hackathonId, teamName, studentIds, mentorId } = req.body;
    const { teamId } = req.params;

    console.log('Edit team request:', { 
      teamId, 
      hackathonId, 
      teamName, 
      studentIds, 
      mentorId 
    });

    // Validation: Required fields
    if (!hackathonId) {
      return res.status(400).json({ error: 'hackathonId is required' });
    }
    if (!teamName || !teamName.trim()) {
      return res.status(400).json({ error: 'Team name is required' });
    }
    if (!studentIds || studentIds.length === 0) {
      return res.status(400).json({ error: 'At least one student is required' });
    }

    // Verify hackathon exists and get team size limits
    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({ error: 'Hackathon not found' });
    }

    const { minTeam, maxTeam } = await getTeamSizeLimits(hackathonId);

    // Validation: Team size
    if (studentIds.length < minTeam) {
      return res.status(400).json({ 
        error: `Team must have at least ${minTeam} member(s)` 
      });
    }
    if (studentIds.length > maxTeam) {
      return res.status(400).json({ 
        error: `Team size cannot exceed ${maxTeam} members` 
      });
    }

    // Verify team exists in this hackathon
    const team = await HackTeams.findOne({ 
      _id: teamId, 
      hackathon: hackathon._id 
    });
    if (!team) {
      return res.status(404).json({ 
        error: 'Team not found in this hackathon' 
      });
    }

    // Check team name uniqueness (excluding current team)
    if (teamName.trim() !== team.name) {
      const nameConflict = await HackTeams.findOne({
        name: teamName.trim(),
        hackathon: hackathon._id,
        _id: { $ne: teamId }
      });
      if (nameConflict) {
        return res.status(400).json({ 
          error: `Team name "${teamName}" already exists for this hackathon. Please choose a different name.` 
        });
      }
    }

    // Get hackathon registrations
    const hackReg = await HackRegister.findOne({ hackathon: hackathon._id });
    if (!hackReg) {
      return res.status(400).json({ 
        error: 'No registrations found for this hackathon' 
      });
    }

    // Map student IDs to registration IDs if needed
    const mappedStudentIds = mapStudentIdsToRegistrationIds(studentIds, hackReg);

    console.log('Original studentIds:', studentIds);
    console.log('Mapped to registration IDs:', mappedStudentIds);

    // Get all approved registration IDs
    const approvedRegIds = hackReg.students
      .filter(s => s.status === 'approved')
      .map(s => s._id.toString());

    // Validate all students are approved
    for (const sid of mappedStudentIds) {
      if (!approvedRegIds.includes(sid)) {
        const regEntry = hackReg.students.id(sid);
        if (!regEntry) {
          return res.status(400).json({ 
            error: `Registration ID ${sid} not found for this hackathon` 
          });
        } else if (regEntry.status !== 'approved') {
          return res.status(400).json({ 
            error: `Student registration ${sid} is not approved (status: ${regEntry.status})` 
          });
        }
      }
    }

    // Get the current team's student IDs
    const currentStudentIds = team.students.map(s => s.toString());
    
    // Find new students being added (not in current team)
    const newStudentIds = mappedStudentIds.filter(sid => 
      !currentStudentIds.includes(sid)
    );
    
    console.log('Current student IDs:', currentStudentIds);
    console.log('New student IDs being added:', newStudentIds);

    // Check if any NEW students are already in other teams
    if (newStudentIds.length > 0) {
      const conflictingTeams = await HackTeams.find({
        hackathon: hackathon._id,
        _id: { $ne: teamId },
        students: { $in: newStudentIds }
      });

      if (conflictingTeams.length > 0) {
        const conflictedStudentIds = new Set();
        conflictingTeams.forEach(t => 
          t.students.forEach(sid => {
            const sidStr = sid.toString();
            if (newStudentIds.includes(sidStr)) {
              conflictedStudentIds.add(sidStr);
            }
          })
        );
        
        const conflictedStudents = Array.from(conflictedStudentIds);
        
        await hackReg.populate('students.student');
        const conflictDetails = conflictedStudents.map(regId => {
          const regEntry = hackReg.students.id(regId);
          if (regEntry && regEntry.student) {
            const student = regEntry.student;
            return {
              registrationId: regId,
              studentName: student.name || 'Unknown',
              studentEmail: student.email || 'Unknown'
            };
          }
          return { registrationId: regId };
        });

        return res.status(400).json({ 
          error: 'One or more students are already in another team for this hackathon', 
          conflictedStudents,
          conflictDetails,
          message: 'Each student can only join one team per hackathon'
        });
      }
    }

    // Verify mentor approval if provided
    if (mentorId) {
      const hackMentor = await HackMentor.findOne({ 
        hackathon: hackathon._id, 
        'mentors.mentor': mentorId, 
        'mentors.status': 'approved' 
      });
      if (!hackMentor) {
        return res.status(400).json({ 
          error: 'Selected mentor does not exist or is not approved for this hackathon' 
        });
      }
    }

    // Update team
    team.name = teamName.trim();
    team.students = mappedStudentIds;
    team.mentor = mentorId || null;
    team.teamLead = mappedStudentIds[0];

    await team.save();

    console.log('Team updated successfully:', team._id);

    const populatedTeam = await populateTeamDetails(team);
    res.json(populatedTeam);
  } catch (error) {
    console.error('Edit team error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: Object.values(error.errors).map(e => e.message) 
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        error: 'A team with this name already exists for this hackathon' 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to edit team', 
      details: error.message 
    });
  }
});

/**
 * DELETE /teams/:teamId - Delete a team
 */
router.delete('/teams/:teamId', async (req, res) => {
  try {
    const { hackathonId } = req.body;
    const { teamId } = req.params;

    if (!hackathonId) {
      return res.status(400).json({ error: 'hackathonId is required' });
    }

    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({ error: 'Hackathon not found' });
    }

    const team = await HackTeams.findOne({ 
      _id: teamId, 
      hackathon: hackathon._id 
    });
    if (!team) {
      return res.status(404).json({ 
        error: 'Team not found in this hackathon' 
      });
    }

    await HackTeams.deleteOne({ _id: teamId });

    res.json({ 
      message: 'Team deleted successfully',
      teamId: teamId,
      teamName: team.name
    });
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ 
      error: 'Failed to delete team', 
      details: error.message 
    });
  }
});

/**
 * GET /teams - Get all teams (optionally filtered by hackathon)
 */
// router.get('/teams', async (req, res) => {
//   try {
//     const { hackathonId } = req.query;
//     let query = {};
//     if (hackathonId) query.hackathon = hackathonId;

//     const teams = await HackTeams.find(query).sort({ createdAt: -1 });

//     const formattedTeams = await Promise.all(teams.map(async team => {
//       const students = await getTeamStudents(team.hackathon, team.students);
      
//       let teamLead = null;
//       if (team.teamLead) {
//         teamLead = await getStudentInfoFromRegId(team.hackathon, team.teamLead);
//       }
      
//       let mentor = null;
//       if (team.mentor) {
//         try {
//           mentor = await Mentor.findById(team.mentor)
//             .select('name email github linkedin');
//           if (mentor) {
//             mentor = {
//               _id: mentor._id,
//               name: mentor.name,
//               email: mentor.email,
//               github: mentor.github || null,
//               linkedin: mentor.linkedin || null
//             };
//           }
//         } catch (error) {
//           console.error('Error fetching mentor:', error);
//         }
//       }
      
//       return {
//         _id: team._id,
//         name: team.name,
//         hackathon: team.hackathon,
//         teamLead,
//         students,
//         mentor,
//         createdAt: team.createdAt,
//         updatedAt: team.updatedAt
//       };
//     }));

//     res.json(formattedTeams);
//   } catch (error) {
//     console.error('Fetch teams error:', error);
//     res.status(500).json({ 
//       error: 'Failed to fetch teams',
//       details: error.message 
//     });
//   }
// });
router.get('/teams', async (req, res) => {
  try {
    const { hackathonId, coordinatorYear, coordinatorCollege } = req.query;
    
    console.log('\n=== GET /teams REQUEST ===');
    console.log('Query params:', { hackathonId, coordinatorYear, coordinatorCollege });
    
    let query = {};
    if (hackathonId) query.hackathon = hackathonId;

    const teams = await HackTeams.find(query).sort({ createdAt: -1 });
    
    console.log(`Found ${teams.length} teams before filtering`);

    const formattedTeams = await Promise.all(teams.map(async team => {
      const students = await getTeamStudents(team.hackathon, team.students);
      
      let teamLead = null;
      if (team.teamLead) {
        teamLead = await getStudentInfoFromRegId(team.hackathon, team.teamLead);
      }
      
      let mentor = null;
      if (team.mentor) {
        try {
          mentor = await Mentor.findById(team.mentor)
            .select('name email github linkedin');
          if (mentor) {
            mentor = {
              _id: mentor._id,
              name: mentor.name,
              email: mentor.email,
              github: mentor.github || null,
              linkedin: mentor.linkedin || null
            };
          }
        } catch (error) {
          console.error('Error fetching mentor:', error);
        }
      }
      
      return {
        _id: team._id,
        name: team.name,
        hackathon: team.hackathon,
        teamLead,
        students,
        mentor,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt
      };
    }));

    // Filter teams based on team lead's year and college
    let filteredTeams = formattedTeams;
    
    if (coordinatorYear || coordinatorCollege) {
      filteredTeams = formattedTeams.filter(team => {
        // Check team lead's details
        if (!team.teamLead) {
          console.log(`❌ Filtering out team "${team.name}": No team lead`);
          return false;
        }
        
        // Check year match
        if (coordinatorYear && team.teamLead.currentYear !== coordinatorYear) {
          console.log(`❌ Filtering out team "${team.name}": Team lead year="${team.teamLead.currentYear}" != coordinator year="${coordinatorYear}"`);
          return false;
        }
        
        // Check college match
        if (coordinatorCollege && team.teamLead.college !== coordinatorCollege) {
          console.log(`❌ Filtering out team "${team.name}": Team lead college="${team.teamLead.college}" != coordinator college="${coordinatorCollege}"`);
          return false;
        }
        
        console.log(`✅ Including team "${team.name}": ${team.teamLead.college} - ${team.teamLead.currentYear}`);
        return true;
      });
      
      console.log(`After filtering: ${filteredTeams.length} teams match ${coordinatorCollege} - ${coordinatorYear}`);
    }

    res.json(filteredTeams);
  } catch (error) {
    console.error('Fetch teams error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch teams',
      details: error.message 
    });
  }
});
/**
 * GET /teams/:teamId - Get a single team by ID
 */
router.get('/teams/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    
    if (!teamId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid team ID format' });
    }
    
    const team = await HackTeams.findById(teamId);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const students = await getTeamStudents(team.hackathon, team.students);
    
    let teamLead = null;
    if (team.teamLead) {
      teamLead = await getStudentInfoFromRegId(team.hackathon, team.teamLead);
    }
    
    let mentor = null;
    if (team.mentor) {
      try {
        const mentorDoc = await Mentor.findById(team.mentor)
          .select('name email github linkedin');
        if (mentorDoc) {
          mentor = {
            _id: mentorDoc._id,
            name: mentorDoc.name,
            email: mentorDoc.email,
            github: mentorDoc.github || null,
            linkedin: mentorDoc.linkedin || null
          };
        }
      } catch (error) {
        console.error('Error fetching mentor:', error);
      }
    }

    res.json({
      _id: team._id,
      name: team.name,
      hackathon: team.hackathon,
      teamLead,
      students,
      mentor,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt
    });
  } catch (error) {
    console.error('Fetch team error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch team',
      details: error.message 
    });
  }
});

/**
 * GET /teams/mentor/:mentorId - Get all teams for a specific mentor
 */
router.get('/teams/mentor/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    const { hackathonId } = req.query;
    
    let query = { mentor: mentorId };
    if (hackathonId) {
      query.hackathon = hackathonId;
    }
    
    const teams = await HackTeams.find(query).sort({ createdAt: -1 });
    
    const formattedTeams = await Promise.all(teams.map(async team => {
      const students = await getTeamStudents(team.hackathon, team.students);
      
      let teamLead = null;
      if (team.teamLead) {
        teamLead = await getStudentInfoFromRegId(team.hackathon, team.teamLead);
      }
      
      let mentor = null;
      if (team.mentor) {
        mentor = await Mentor.findById(team.mentor)
          .select('name email github linkedin');
      }
      
      return {
        _id: team._id,
        name: team.name,
        hackathon: team.hackathon,
        teamLead,
        students,
        mentor: mentor ? {
          _id: mentor._id,
          name: mentor.name,
          email: mentor.email,
          github: mentor.github || null,
          linkedin: mentor.linkedin || null
        } : null,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt
      };
    }));
    
    res.json(formattedTeams);
  } catch (error) {
    console.error('Fetch mentor teams error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch mentor teams',
      details: error.message 
    });
  }
});

module.exports = router;