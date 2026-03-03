const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken, authenticateStudentToken } = require('../../middleware/auth');
const HackTeams = require('../Models/hackteam');
const Hackathon = require('../Models/HackathonAdmin');
const HackRegister = require('../Models/hack-reg');
const HackMentor = require('../Models/Hackmentor');
const { Student, Mentor } = require('../../models/roles');
const TeamRequest = require('../Models/hackteamrequest');
const TeamJoinRequest = require('../Models/hackjointeamrequest');

const TEAM_SIZE_LIMIT = 4;

function logRoute(route, data) {
  console.log(`[${new Date().toISOString()}] Route: ${route} -`, data);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function populateTeamDetails(team) {
  console.log('🔍 Populating team:', team._id);
  console.log('📝 Raw students array:', team.students);
  
  const hackReg = await HackRegister.findOne({ hackathon: team.hackathon })
    .populate('students.student');
  
  if (!hackReg) {
    console.error('❌ No HackRegister found for hackathon:', team.hackathon);
    return {
      _id: team._id,
      name: team.name,
      hackathon: team.hackathon,
      teamLead: null,
      students: [],
      mentor: null,
      createdAt: team.createdAt,
      updatedAt: team.updatedAt
    };
  }

  console.log('✅ Found HackRegister with', hackReg.students.length, 'students');

  let teamLeadDetails = null;
  if (team.teamLead) {
    const teamLeadEntry = hackReg.students.id(team.teamLead);
    if (teamLeadEntry && teamLeadEntry.student) {
      teamLeadDetails = {
        _id: teamLeadEntry.student._id,
        name: teamLeadEntry.student.name,
        email: teamLeadEntry.student.email,
        rollNo: teamLeadEntry.student.rollNo,
        college: teamLeadEntry.student.college,
        branch: teamLeadEntry.student.branch,
        github: teamLeadEntry.student.github,
        linkedin: teamLeadEntry.student.linkedin
      };
    }
  }

  let mentorDetails = null;
  if (team.mentor) {
    try {
      const mentorDoc = await Mentor.findById(team.mentor)
        .select('name email github linkedin');
      if (mentorDoc) {
        mentorDetails = {
          _id: mentorDoc._id,
          name: mentorDoc.name,
          email: mentorDoc.email,
          github: mentorDoc.github || null,
          linkedin: mentorDoc.linkedin || null
        };
      }
    } catch (error) {
      console.error('❌ Error fetching mentor:', error);
    }
  }

  const mappedStudents = team.students.map(regId => {
    const regEntry = hackReg.students.id(regId);
    
    if (!regEntry) {
      console.warn('⚠️ Registration entry not found for ID:', regId);
      return null;
    }
    
    if (!regEntry.student) {
      console.warn('⚠️ Student not populated for reg entry:', regId);
      return null;
    }

    const student = regEntry.student;
    console.log('✅ Mapped student:', student.name);
    
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
  }).filter(Boolean);

  console.log('📊 Total mapped students:', mappedStudents.length);

  return {
    _id: team._id,
    name: team.name,
    hackathon: team.hackathon,
    teamLead: teamLeadDetails,
    students: mappedStudents,
    mentor: mentorDetails,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  };
}

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
    branch: regEntry.student.branch,
    github: regEntry.student.github,
    linkedin: regEntry.student.linkedin
  };
}

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
      branch: regEntry.student.branch,
      github: regEntry.student.github,
      linkedin: regEntry.student.linkedin
    };
  }).filter(Boolean);
}

// ============================================
// INVITATION & JOIN REQUEST ROUTES
// ============================================

// GET incoming invitations for logged-in student
router.get('/invitations/incoming', authenticateStudentToken, async (req, res) => {
  logRoute('GET /invitations/incoming', { studentId: req.studentId });
  try {
    const invites = await TeamRequest.find({ recipient: req.studentId, status: 'pending' })
      .populate('teamId', 'name')
      .populate('sender', 'name');
    logRoute('GET /invitations/incoming result', { count: invites.length });
    res.json(invites);
  } catch (err) {
    console.error('Error /invitations/incoming:', err);
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

// GET outgoing invitations sent by logged-in student
router.get('/invitations/outgoing', authenticateStudentToken, async (req, res) => {
  logRoute('GET /invitations/outgoing', { studentId: req.studentId });
  try {
    const invites = await TeamRequest.find({ sender: req.studentId })
      .populate('teamId', 'name')
      .populate('recipient', 'name');
    logRoute('GET /invitations/outgoing result', { count: invites.length });
    res.json(invites);
  } catch (err) {
    console.error('Error /invitations/outgoing:', err);
    res.status(500).json({ error: 'Failed to fetch outgoing invitations' });
  }
});

// GET pending join requests for teams led by logged-in student
router.get('/join-requests', authenticateStudentToken, async (req, res) => {
  logRoute('GET /join-requests', { studentId: req.studentId });
  try {
    const hackReg = await HackRegister.findOne({ 'students.student': req.studentId });
    if (!hackReg) {
      return res.json([]);
    }

    const studentRegEntry = hackReg.students.find(s => s.student.toString() === req.studentId);
    if (!studentRegEntry) {
      return res.json([]);
    }

    const teamsLed = await HackTeams.find({ teamLead: studentRegEntry._id });
    const teamIds = teamsLed.map(t => t._id);
    const requests = await TeamJoinRequest.find({ teamId: { $in: teamIds }, status: 'pending' })
      .populate('sender', 'name')
      .populate('teamId', 'name');
    logRoute('GET /join-requests result', { count: requests.length });
    res.json(requests);
  } catch (err) {
    console.error('Error /join-requests:', err);
    res.status(500).json({ error: 'Failed to fetch join requests' });
  }
});

// GET my sent join requests (requests I've sent to teams)
router.get('/join-requests/sent', authenticateStudentToken, async (req, res) => {
  logRoute('GET /join-requests/sent', { studentId: req.studentId });
  try {
    const requests = await TeamJoinRequest.find({ sender: req.studentId })
      .populate('teamId', 'name')
      .populate('recipient', 'name');
    logRoute('GET /join-requests/sent result', { count: requests.length });
    res.json(requests);
  } catch (err) {
    console.error('Error /join-requests/sent:', err);
    res.status(500).json({ error: 'Failed to fetch sent join requests' });
  }
});

// ============================================
// TEAM ROUTES
// ============================================

// GET /myteam - Get the team for a specific/current hackathon
router.get('/myteam', authenticateToken, async (req, res) => {
  logRoute('GET /myteam', { userId: req.user.userId || req.user.id || req.user._id, query: req.query });
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const { hackathonId } = req.query;

    console.log('🔍 Looking for user:', userId, 'hackathonId:', hackathonId || '(any)');

    // If hackathonId is passed, ensure that hackathon exists and is ongoing
    if (hackathonId) {
      const hack = await Hackathon.findById(hackathonId).select('status');
      if (!hack) {
        console.log('❌ Hackathon not found:', hackathonId);
        return res.status(404).json({ message: 'Hackathon not found' });
      }
      if (hack.status !== 'ongoing') {
        console.log('❌ Hackathon is not ongoing:', hackathonId, hack.status);
        return res.status(400).json({ message: 'Hackathon is not ongoing' });
      }

      // Find registration for this hackathon specifically
      const hackRegEntry = await HackRegister.findOne({ hackathon: hackathonId, 'students.student': userId });
      if (!hackRegEntry) {
        console.log('❌ No registration found for user in this hackathon:', userId, hackathonId);
        return res.status(404).json({ message: 'No registration found for this hackathon' });
      }

      const studentRegEntry = hackRegEntry.students.find(s => s.student.toString() === userId);
      if (!studentRegEntry) {
        console.log('❌ Student not found in registration entries for hackathon:', hackathonId);
        return res.status(404).json({ message: 'Registration entry not found' });
      }

      const team = await HackTeams.findOne({ hackathon: hackathonId, students: studentRegEntry._id });
      if (!team) {
        console.log('❌ No team found for registration ID in hackathon:', studentRegEntry._id, hackathonId);
        return res.status(404).json({ message: 'No team found for this hackathon' });
      }

      const populatedTeam = await populateTeamDetails(team);
      return res.json(populatedTeam);
    }

    // Fallback: find all hackathon registrations for this user
    const allHackRegEntries = await HackRegister.find({ 'students.student': userId });
    if (!allHackRegEntries || allHackRegEntries.length === 0) {
      console.log('❌ No registration found for user:', userId);
      return res.status(404).json({ message: 'No registration found' });
    }

    // Find an ongoing hackathon among the registered ones
    let ongoingHackReg = null;
    let ongoingHack = null;
    
    for (const hackRegEntry of allHackRegEntries) {
      const hack = await Hackathon.findById(hackRegEntry.hackathon).select('status');
      if (hack && hack.status === 'ongoing') {
        ongoingHackReg = hackRegEntry;
        ongoingHack = hack;
        break;
      }
    }
    
    if (!ongoingHackReg || !ongoingHack) {
      console.log('❌ No ongoing hackathon found among user registrations');
      return res.status(400).json({ message: 'No ongoing registered hackathon found' });
    }

    const studentRegEntry = ongoingHackReg.students.find(s => s.student.toString() === userId);
    if (!studentRegEntry) {
      console.log('❌ Student not found in registration entries');
      return res.status(404).json({ message: 'Registration entry not found' });
    }

    const team = await HackTeams.findOne({ students: studentRegEntry._id, hackathon: ongoingHackReg.hackathon });
    if (!team) {
      console.log('❌ No team found for registration ID:', studentRegEntry._id);
      return res.status(404).json({ message: 'No team found' });
    }

    const populatedTeam = await populateTeamDetails(team);
    res.json(populatedTeam);
  } catch (err) {
    console.error('❌ Error in /myteam:', err);
    res.status(500).json({ error: 'Failed to fetch team details', details: err.message });
  }
});

// GET /students/search - Search for students with invitation/request status
router.get('/students/search', authenticateStudentToken, async (req, res) => {
  const { hackathonId, branch, editingTeamId, search, showTeamMembers } = req.query;
  const currentStudentId = req.studentId;
  
  if (!hackathonId) return res.status(400).json({ error: 'hackathonId required' });

  try {
    const hackReg = await HackRegister.findOne({ hackathon: hackathonId }).populate('students.student');
    if (!hackReg) return res.json([]);

    const teamsInHackathon = await HackTeams.find({ hackathon: hackathonId });
    const regIdToTeamMap = {};
    
    teamsInHackathon.forEach(team => {
      team.students.forEach(regId => {
        regIdToTeamMap[regId.toString()] = {
          teamId: team._id,
          teamName: team.name,
          teamLeadRegId: team.teamLead
        };
      });
    });

    // Get all pending invitations sent by current student
    const pendingInvitations = await TeamRequest.find({
      sender: currentStudentId,
      hackathon: hackathonId,
      status: 'pending'
    });
    
    const invitedStudentIds = new Set(pendingInvitations.map(inv => inv.recipient.toString()));

    // Get all pending join requests sent by current student
    const pendingJoinRequests = await TeamJoinRequest.find({
      sender: currentStudentId,
      hackathon: hackathonId,
      status: 'pending'
    });
    
    const requestedTeamIds = new Set(pendingJoinRequests.map(req => req.teamId.toString()));

    let students = hackReg.students.filter(s =>
      s.status === 'approved' &&
      s.student &&
      s.student._id.toString() !== currentStudentId && // Exclude current student
      (!branch || s.student.branch === branch)
    );

    // Combined search for both name and roll number
    if (search && search.trim() !== '') {
      const searchLower = search.trim().toLowerCase();
      students = students.filter(s => {
        const name = (s.student.name || '').toLowerCase();
        const rollNo = (s.student.rollNo || '').toLowerCase();
        return name.includes(searchLower) || rollNo.includes(searchLower);
      });
    }

    const result = students.map(regEntry => {
      const regIdStr = regEntry._id.toString();
      const teamInfo = regIdToTeamMap[regIdStr];
      const inTeam = !!teamInfo;
      const studentId = regEntry.student._id.toString();
      
      return {
        _id: regEntry._id,
        studentId: regEntry.student._id,
        name: regEntry.student.name,
        email: regEntry.student.email,
        rollNo: regEntry.student.rollNo,
        college: regEntry.student.college,
        branch: regEntry.student.branch,
        github: regEntry.student.github || null,
        linkedin: regEntry.student.linkedin || null,
        inTeam: inTeam,
        teamId: teamInfo ? teamInfo.teamId : null,
        teamName: teamInfo ? teamInfo.teamName : null,
        isTeamLead: teamInfo ? teamInfo.teamLeadRegId.toString() === regIdStr : false,
        hasPendingInvitation: invitedStudentIds.has(studentId),
        hasPendingJoinRequest: inTeam && requestedTeamIds.has(teamInfo.teamId.toString())
      };
    });

    // Filter based on showTeamMembers flag
    if (showTeamMembers === 'true') {
      return res.json(result.filter(s => s.inTeam));
    } else if (showTeamMembers === 'false') {
      return res.json(result.filter(s => !s.inTeam));
    }

    res.json(result);
  } catch (err) {
    console.error('Error /students/search:', err);
    res.status(500).json({ error: 'Failed to search students', details: err.message });
  }
});

// POST /teams/create-with-invites - Create team and send invitations
router.post('/teams/create-with-invites', authenticateStudentToken, async (req, res) => {
  logRoute('POST /teams/create-with-invites', { body: req.body, user: req.studentId });
  try {
    const { teamName, hackathonId, studentIds, mentorId } = req.body;
    const creatorId = req.studentId;

    if (!hackathonId) return res.status(400).json({ error: 'hackathonId is required' });
    if (!teamName || !teamName.trim()) return res.status(400).json({ error: 'Team name is required' });
    if (!studentIds || studentIds.length === 0) return res.status(400).json({ error: 'At least one student is required' });

    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) return res.status(404).json({ error: 'Hackathon not found' });

    const existingTeam = await HackTeams.findOne({ name: teamName.trim(), hackathon: hackathon._id });
    if (existingTeam) return res.status(400).json({ error: 'Team name already exists for this hackathon' });

    const hackReg = await HackRegister.findOne({ hackathon: hackathon._id }).populate('students.student');
    if (!hackReg) return res.status(400).json({ error: 'No registrations for this hackathon found' });

    const creatorRegEntry = hackReg.students.find(s => s.student._id.toString() === creatorId);
    if (!creatorRegEntry) return res.status(400).json({ error: 'You are not registered for this hackathon' });

    const creatorInTeam = await HackTeams.findOne({ hackathon: hackathon._id, students: creatorRegEntry._id });
    if (creatorInTeam) return res.status(400).json({ error: 'You are already in a team for this hackathon' });

    if (mentorId) {
      const hackMentor = await HackMentor.findOne({ hackathon: hackathon._id, 'mentors.mentor': mentorId, 'mentors.status': 'approved' });
      if (!hackMentor) return res.status(400).json({ error: 'Selected mentor is not approved for this hackathon' });
    }

    const newTeam = new HackTeams({
      name: teamName.trim(),
      hackathon: hackathon._id,
      students: [creatorRegEntry._id],
      mentor: mentorId || null,
      teamLead: creatorRegEntry._id
    });
    await newTeam.save();

    let invitationsSent = 0;
    let alreadyInvited = 0;
    const invitationResults = [];

    const invitationPromises = studentIds.map(async (recipientId) => {
      if (recipientId === creatorId) return null;

      const recipientReg = hackReg.students.find(reg => reg.student._id.toString() === recipientId);
      if (!recipientReg) {
        console.log(`Recipient ${recipientId} not found in registrations`);
        invitationResults.push({ recipientId, status: 'not_found' });
        return null;
      }

      // Check if pending invitation already exists to this specific recipient
      const existingInvite = await TeamRequest.findOne({
        sender: creatorId,
        recipient: recipientId,
        teamId: newTeam._id,
        status: 'pending'
      });

      if (existingInvite) {
        console.log(`Invitation already sent to ${recipientId}`);
        alreadyInvited++;
        invitationResults.push({ recipientId, status: 'already_invited' });
        return null;
      }

      const invite = new TeamRequest({
        sender: creatorId,
        recipient: recipientId,
        teamId: newTeam._id,
        hackathon: hackathon._id
      });
      await invite.save();
      invitationsSent++;
      invitationResults.push({ recipientId, status: 'sent' });
      return invite;
    });

    await Promise.all(invitationPromises);

    const populatedTeam = await populateTeamDetails(newTeam);
    
    let message = `Team created successfully. Invitations sent to ${invitationsSent} student(s).`;
    if (alreadyInvited > 0) {
      message += ` ${alreadyInvited} student(s) already had pending invitations.`;
    }

    res.status(201).json({
      team: populatedTeam,
      message,
      invitationResults
    });
  } catch (error) {
    console.error('Error /teams/create-with-invites:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Duplicate team name for this hackathon' });
    }
    res.status(500).json({ error: 'Failed to create team', details: error.message });
  }
});

// POST /teams/invitations/:requestId/respond - Respond to team invitation
router.post('/teams/invitations/:requestId/respond', authenticateStudentToken, async (req, res) => {
  logRoute('POST /teams/invitations/:requestId/respond', { requestId: req.params.requestId, body: req.body, user: req.studentId });
  try {
    const { requestId } = req.params;
    const { response } = req.body;
    const studentId = req.studentId;

    if (!['accepted', 'rejected'].includes(response)) {
      return res.status(400).json({ error: `Invalid response: ${response}` });
    }

    const invite = await TeamRequest.findById(requestId);
    if (!invite) return res.status(404).json({ error: 'Invitation not found' });
    if (invite.recipient.toString() !== studentId) {
      return res.status(403).json({ error: 'Not authorized to respond' });
    }
    if (invite.status !== 'pending') {
      return res.status(400).json({ error: 'Invitation already responded to' });
    }

    if (response === 'accepted') {
      const team = await HackTeams.findById(invite.teamId);
      if (!team) {
        await TeamRequest.findByIdAndDelete(requestId);
        return res.status(404).json({ error: 'Team not found' });
      }

      const hackathon = await Hackathon.findById(team.hackathon);
      if (!hackathon) {
        await TeamRequest.findByIdAndDelete(requestId);
        return res.status(404).json({ error: 'Hackathon not found' });
      }

      // Check current team size in real-time
      if (team.students.length >= hackathon.maxteam) {
        await TeamRequest.findByIdAndDelete(requestId);
        return res.status(400).json({ error: 'Team is now full. Cannot accept invitation.' });
      }

      const hackReg = await HackRegister.findOne({ hackathon: team.hackathon }).populate('students.student');
      if (!hackReg) {
        await TeamRequest.findByIdAndDelete(requestId);
        return res.status(400).json({ error: 'No registrations found' });
      }

      const recipientReg = hackReg.students.find(reg => reg.student._id.toString() === studentId);
      if (!recipientReg) {
        await TeamRequest.findByIdAndDelete(requestId);
        return res.status(400).json({ error: 'You are not registered for this hackathon' });
      }

      const conflict = await HackTeams.findOne({ hackathon: team.hackathon, students: recipientReg._id });
      if (conflict) {
        await TeamRequest.findByIdAndDelete(requestId);
        return res.status(400).json({ error: 'You are already in another team' });
      }

      team.students.push(recipientReg._id);
      await team.save();

      // DELETE the accepted invitation immediately
      await TeamRequest.findByIdAndDelete(requestId);
      
      // Also delete any other pending invitations for this student for the same hackathon
      await TeamRequest.deleteMany({
        recipient: studentId,
        hackathon: team.hackathon,
        status: 'pending',
        _id: { $ne: requestId }
      });

      res.json({ message: 'Invitation accepted and you have been added to the team' });
    } else {
      // DELETE the rejected invitation immediately
      await TeamRequest.findByIdAndDelete(requestId);
      res.json({ message: 'Invitation rejected' });
    }
  } catch (err) {
    console.error('Error /teams/invitations/:requestId/respond:', err);
    res.status(500).json({ error: 'Failed to respond to invitation', details: err.message });
  }
});

// POST /teams/:teamId/join-requests - Send join request to team
router.post('/teams/:teamId/join-requests', authenticateStudentToken, async (req, res) => {
  logRoute('POST /teams/:teamId/join-requests', { teamId: req.params.teamId, user: req.studentId });
  try {
    const { teamId } = req.params;
    const senderId = req.studentId;
    const { message } = req.body;
    const team = await HackTeams.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const hackathon = await Hackathon.findById(team.hackathon);
    if (!hackathon) return res.status(404).json({ error: 'Hackathon not found' });

    const hackReg = await HackRegister.findOne({ hackathon: team.hackathon }).populate('students.student');
    if (!hackReg) return res.status(400).json({ error: 'No registrations for hackathon' });

    const senderReg = hackReg.students.find(reg => reg.student._id.toString() === senderId);
    if (!senderReg) return res.status(400).json({ error: 'You are not registered for this hackathon' });

    if (await HackTeams.findOne({ hackathon: team.hackathon, students: senderReg._id })) {
      return res.status(400).json({ error: 'You are already in a team for this hackathon' });
    }

    // Check if pending join request already exists for this team
    const existingRequest = await TeamJoinRequest.findOne({
      sender: senderId,
      teamId: teamId,
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(400).json({ error: 'You have already sent a join request to this team' });
    }

    const teamLeadEntry = hackReg.students.id(team.teamLead);
    if (!teamLeadEntry || !teamLeadEntry.student) {
      return res.status(400).json({ error: 'Team lead not found' });
    }

    const joinRequest = new TeamJoinRequest({ 
      sender: senderId, 
      recipient: teamLeadEntry.student._id, 
      teamId, 
      hackathon: team.hackathon 
    });
    await joinRequest.save();

    res.status(201).json({ message: 'Join request sent to team lead' });
  } catch (err) {
    console.error('Error /teams/:teamId/join-requests:', err);
    res.status(500).json({ error: 'Failed to send join request', details: err.message });
  }
});

// POST /teams/join-requests/:requestId/respond - Respond to join request
router.post('/teams/join-requests/:requestId/respond', authenticateStudentToken, async (req, res) => {
  logRoute('POST /teams/join-requests/:requestId/respond', { 
    requestId: req.params.requestId, 
    body: req.body, 
    user: req.studentId 
  });
  try {
    const { requestId } = req.params;
    const { response } = req.body;
    const userId = req.studentId;

    if (!['accepted', 'rejected'].includes(response)) {
      return res.status(400).json({ error: `Invalid response: ${response}` });
    }

    const joinRequest = await TeamJoinRequest.findById(requestId);
    if (!joinRequest) return res.status(404).json({ error: 'Join request not found' });
    if (joinRequest.recipient.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized to respond' });
    }
    if (joinRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Join request already responded to' });
    }

    if (response === 'accepted') {
      const team = await HackTeams.findById(joinRequest.teamId);
      if (!team) {
        await TeamJoinRequest.findByIdAndDelete(requestId);
        return res.status(404).json({ error: 'Team not found' });
      }

      const hackathon = await Hackathon.findById(team.hackathon);
      if (!hackathon) {
        await TeamJoinRequest.findByIdAndDelete(requestId);
        return res.status(404).json({ error: 'Hackathon not found' });
      }

      // Check current team size in real-time
      if (team.students.length >= hackathon.maxteam) {
        await TeamJoinRequest.findByIdAndDelete(requestId);
        return res.status(400).json({ error: 'Team is now full. Cannot accept join request.' });
      }

      const hackReg = await HackRegister.findOne({ hackathon: team.hackathon }).populate('students.student');
      if (!hackReg) {
        await TeamJoinRequest.findByIdAndDelete(requestId);
        return res.status(400).json({ error: 'No registrations found' });
      }

      const senderReg = hackReg.students.find(reg => reg.student._id.toString() === joinRequest.sender.toString());
      if (!senderReg) {
        await TeamJoinRequest.findByIdAndDelete(requestId);
        return res.status(400).json({ error: 'Requesting student not found' });
      }

      const conflict = await HackTeams.findOne({ hackathon: team.hackathon, students: senderReg._id });
      if (conflict) {
        await TeamJoinRequest.findByIdAndDelete(requestId);
        return res.status(400).json({ error: 'Student already in another team' });
      }

      team.students.push(senderReg._id);
      await team.save();

      // DELETE the accepted join request immediately
      await TeamJoinRequest.findByIdAndDelete(requestId);
      
      // Also delete any other pending join requests from this student for the same hackathon
      await TeamJoinRequest.deleteMany({
        sender: joinRequest.sender,
        hackathon: team.hackathon,
        status: 'pending',
        _id: { $ne: requestId }
      });

      res.json({ message: 'Join request accepted and student added to team' });
    } else {
      // DELETE the rejected join request immediately
      await TeamJoinRequest.findByIdAndDelete(requestId);
      res.json({ message: 'Join request rejected' });
    }
  } catch (err) {
    console.error('Error /teams/join-requests/:requestId/respond:', err);
    res.status(500).json({ error: 'Failed to respond to join request', details: err.message });
  }
});

// GET /teams/:teamId - Get team details
router.get('/teams/:teamId', async (req, res) => {
  logRoute('GET /teams/:teamId', { teamId: req.params.teamId });
  try {
    const { teamId } = req.params;
    if (!teamId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid team ID format' });
    }

    const team = await HackTeams.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const students = await getTeamStudents(team.hackathon, team.students);

    let teamLead = null;
    if (team.teamLead) {
      teamLead = await getStudentInfoFromRegId(team.hackathon, team.teamLead);
    }

    let mentor = null;
    if (team.mentor) {
      try {
        const mentorDoc = await Mentor.findById(team.mentor).select('name email github linkedin');
        if (mentorDoc) {
          mentor = {
            _id: mentorDoc._id,
            name: mentorDoc.name,
            email: mentorDoc.email,
            github: mentorDoc.github || null,
            linkedin: mentorDoc.linkedin || null
          };
        }
      } catch (err) {
        console.error('Error fetching mentor:', err);
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
  } catch (err) {
    console.error('Error /teams/:teamId:', err);
    res.status(500).json({ error: 'Failed to fetch team', details: err.message });
  }
});

// POST /teams/:teamId/send-invites - Send invitations to students
router.post('/teams/:teamId/send-invites', authenticateStudentToken, async (req, res) => {
  logRoute('POST /teams/:teamId/send-invites', { 
    teamId: req.params.teamId, 
    user: req.studentId, 
    body: req.body 
  });
  try {
    const { teamId } = req.params;
    const { studentIds } = req.body;
    const senderId = req.studentId;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ 
        error: 'studentIds array is required with at least one student ID' 
      });
    }

    const team = await HackTeams.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const hackathon = await Hackathon.findById(team.hackathon);
    if (!hackathon) return res.status(404).json({ error: 'Hackathon not found' });

    // Check if team is full
    if (team.students.length >= hackathon.maxteam) {
      return res.status(400).json({ error: 'Team is already full' });
    }

    const hackReg = await HackRegister.findOne({ hackathon: team.hackathon }).populate('students.student');
    if (!hackReg) return res.status(400).json({ error: 'No registrations for hackathon found' });

    const senderRegEntry = hackReg.students.find(s => s.student._id.toString() === senderId);
    if (!senderRegEntry) {
      return res.status(403).json({ error: 'You are not registered for this hackathon' });
    }

    const senderInTeam = await HackTeams.findOne({ _id: teamId, students: senderRegEntry._id });
    if (!senderInTeam) {
      return res.status(403).json({ error: 'You must be a member of the team to send invites' });
    }

    let invitationsSent = 0;
    let alreadyInvited = 0;
    let alreadyInTeam = 0;
    let notRegistered = 0;
    const invitationResults = [];

    for (const recipientId of studentIds) {
      const recipientReg = hackReg.students.find(reg => reg.student._id.toString() === recipientId);
      if (!recipientReg) {
        console.log(`Recipient ${recipientId} not found in hackathon registrations`);
        notRegistered++;
        invitationResults.push({ recipientId, status: 'not_registered' });
        continue;
      }

      const recipientInTeam = await HackTeams.findOne({ 
        hackathon: team.hackathon, 
        students: recipientReg._id 
      });
      if (recipientInTeam) {
        console.log(`Recipient ${recipientId} is already in a team`);
        alreadyInTeam++;
        invitationResults.push({ 
          recipientId, 
          status: 'already_in_team',
          teamName: recipientInTeam.name 
        });
        continue;
      }

      // Check if pending invitation already exists to this specific recipient
      const existingInvite = await TeamRequest.findOne({
        sender: senderId,
        recipient: recipientId,
        teamId: team._id,
        status: 'pending'
      });

      if (existingInvite) {
        console.log(`Invitation already sent to ${recipientId}`);
        alreadyInvited++;
        invitationResults.push({ recipientId, status: 'already_invited' });
        continue;
      }

      // Check available space
      // const currentTeamSize = team.students.length;
      // const pendingInvitationsCount = await TeamRequest.countDocuments({
      //   teamId: team._id,
      //   status: 'pending'
      // });

      // if (currentTeamSize + pendingInvitationsCount >= hackathon.maxteam) {
      //   console.log('Team would exceed max size with pending invitations');
      //   invitationResults.push({ recipientId, status: 'team_full' });
      //   continue;
      // }

      const invite = new TeamRequest({
        sender: senderId,
        recipient: recipientId,
        teamId: team._id,
        hackathon: team.hackathon
      });
      await invite.save();
      invitationsSent++;
      invitationResults.push({ recipientId, status: 'sent' });
    }

    let message = '';
    if (invitationsSent > 0) {
      message = `Successfully sent invitations to ${invitationsSent} student(s).`;
    }
    if (alreadyInvited > 0) {
      message += ` ${alreadyInvited} student(s) already have pending invitations.`;
    }
    if (alreadyInTeam > 0) {
      message += ` ${alreadyInTeam} student(s) are already in teams.`;
    }
    if (notRegistered > 0) {
      message += ` ${notRegistered} student(s) not found in registrations.`;
    }

    if (invitationsSent === 0) {
      return res.status(400).json({ 
        error: 'No invitations were sent', 
        message: message.trim(),
        invitationResults 
      });
    }

    res.status(201).json({ 
      message: message.trim(),
      invitationsSent,
      alreadyInvited,
      alreadyInTeam,
      notRegistered,
      invitationResults 
    });

  } catch (error) {
    console.error('Error /teams/:teamId/send-invites:', error);
    res.status(500).json({ error: 'Failed to send invitations', details: error.message });
  }
});

// DELETE /invitations/:invitationId - Cancel sent invitation
router.delete('/invitations/:invitationId', authenticateStudentToken, async (req, res) => {
  logRoute('DELETE /invitations/:invitationId', { 
    invitationId: req.params.invitationId, 
    user: req.studentId 
  });
  try {
    const { invitationId } = req.params;
    const senderId = req.studentId;

    const invite = await TeamRequest.findById(invitationId);
    if (!invite) return res.status(404).json({ error: 'Invitation not found' });
    
    if (invite.sender.toString() !== senderId) {
      return res.status(403).json({ error: 'Not authorized to cancel this invitation' });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({ error: 'Can only cancel pending invitations' });
    }

    await TeamRequest.findByIdAndDelete(invitationId);
    res.json({ message: 'Invitation cancelled successfully' });
  } catch (err) {
    console.error('Error DELETE /invitations/:invitationId:', err);
    res.status(500).json({ error: 'Failed to cancel invitation', details: err.message });
  }
});

// DELETE /join-requests/:requestId - Cancel sent join request
router.delete('/join-requests/:requestId', authenticateStudentToken, async (req, res) => {
  logRoute('DELETE /join-requests/:requestId', { 
    requestId: req.params.requestId, 
    user: req.studentId 
  });
  try {
    const { requestId } = req.params;
    const senderId = req.studentId;

    const joinRequest = await TeamJoinRequest.findById(requestId);
    if (!joinRequest) return res.status(404).json({ error: 'Join request not found' });
    
    if (joinRequest.sender.toString() !== senderId) {
      return res.status(403).json({ error: 'Not authorized to cancel this join request' });
    }

    if (joinRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Can only cancel pending join requests' });
    }

    await TeamJoinRequest.findByIdAndDelete(requestId);
    res.json({ message: 'Join request cancelled successfully' });
  } catch (err) {
    console.error('Error DELETE /join-requests/:requestId:', err);
    res.status(500).json({ error: 'Failed to cancel join request', details: err.message });
  }
});

// ============================================
// CLEANUP UTILITY
// ============================================

async function cleanupProcessedRequests(hackathonId) {
  try {
    // Delete accepted and rejected team invitations
    const deletedInvites = await TeamRequest.deleteMany({
      hackathon: hackathonId,
      status: { $in: ['accepted', 'rejected'] }
    });
    
    // Delete accepted and rejected join requests
    const deletedRequests = await TeamJoinRequest.deleteMany({
      hackathon: hackathonId,
      status: { $in: ['accepted', 'rejected'] }
    });
    
    console.log(`✅ Cleaned up ${deletedInvites.deletedCount} invitations and ${deletedRequests.deletedCount} join requests for hackathon:`, hackathonId);
    
    return {
      invitationsDeleted: deletedInvites.deletedCount,
      joinRequestsDeleted: deletedRequests.deletedCount
    };
  } catch (error) {
    console.error('❌ Error cleaning up requests:', error);
    throw error;
  }
}

// Admin route to manually trigger cleanup
router.post('/admin/cleanup/:hackathonId', authenticateToken, async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const result = await cleanupProcessedRequests(hackathonId);
    res.json({ 
      message: 'Cleanup completed successfully',
      ...result
    });
  } catch (error) {
    console.error('Error in cleanup route:', error);
    res.status(500).json({ error: 'Failed to cleanup requests', details: error.message });
  }
});

// ============================================
// EXPORTS
// ============================================

module.exports = router;
module.exports.cleanupProcessedRequests = cleanupProcessedRequests;