const express = require('express');
const router = express.Router();
const { Student } = require('../models/roles');
const TeamRequest = require('../models/teamrequests');
const Team = require('../models/teams');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const teamjoinRequest = require('../models/teamjoinrequest.js')

// Constants
const TEAM_SIZE_LIMIT = 4;

router.get('/my-team', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const team = await Team.findOne({
            $or: [
                { students: userId },
                { teamLead: userId }
            ]
        })
        .populate('students', 'name email rollNo college')
        .populate('teamLead', 'name email rollNo college')
        .populate('mentor','name');

        if (!team) return res.json({ inTeam: false });

        // If there's no team lead, assign the first student as the lead
        if (!team.teamLead && team.students.length >= 0) {
            team.teamLead = team.students[0];
        } 
        // If the current team lead has left, assign the next student in the array as the new lead
        else if (team.students.length >=0 && team.teamLead && !team.students.some(student => student._id.toString() === team.teamLead._id.toString())) {
            team.teamLead = team.students[0];
        }

        // Save the updated team with the new lead
        await team.save();

        res.json({
            inTeam: true,
            teamDetails: {
                id: team._id,
                name: team.name,
                members: team.students,
                teamLead: team.teamLead,
                  mentor: team.mentor, 
                vacancies: TEAM_SIZE_LIMIT - team.students.length,
                createdAt: team.createdAt,
                updatedAt: team.updatedAt
            }
        });
    } catch (error) {
        console.error('Error fetching team details:', error.message);
        res.status(500).json({ error: 'Failed to fetch team details' });
    }
});


router.post('/accept-request', authenticateToken, async (req, res) => {
    try {
        const { requestId } = req.body;

        if (!requestId) return res.status(400).json({ error: 'Request ID is required.' });

        const request = await TeamRequest.findById(requestId).populate('sender', 'name email rollNo college');

        if (!request) return res.status(404).json({ error: 'Request not found' });
        
        // Check if recipient is already in a team
        const recipientInTeam = await Team.findOne({ students: request.recipient });
        if (recipientInTeam) {
            return res.status(400).json({ error: 'Cannot accept request. Recipient is already in a team.' });
        }

        let team;

        // Create a new team for the sender if they don't have one yet.
        if (!await Team.findOne({ students: request.sender._id })) {
            // Create a new team without a team name or team lead.
            team = new Team({
                students: [request.sender._id], // Start with the sender as the first member
                mentor: null
            });

            await team.save();
            request.teamId = team._id;
            await request.save();

        } else {
            // Use the existing team if it exists.
            team = await Team.findOne({ students: request.sender._id });

            if (!team.students.includes(request.recipient)) {
                if (team.students.length >= 4) {
                    return res.status(400).json({ error: 'Cannot add more members. A team can have a maximum of 4 members.' });
                }

                // Add the recipient to the existing team's members.
                team.students.push(request.recipient);

                await team.save();
            }
        }

        request.status = 'accepted';
        await request.save();

        res.json({
            message: 'Request accepted successfully',
            teamDetails: team,
            senderName: request.sender.name,
            recipientsName: request.recipient.name,
        });

    } catch (error) {
        console.error('Error accepting join request:', error.message);
        res.status(500).json({ error: 'Failed to accept join request' });
    }
});


// Get all join requests for the current user
router.get('/join-requests', authenticateToken, async(req,res)=>{
    try{
      const userId=req.user.userId;
 
      const requests=await TeamRequest.find({recipient:userId})
        .populate('sender','name email rollNo college') 
        .lean(); 
      res.json(requests);
 
    } catch(error){
      console.error('Error fetching join requests:',error.message);
      res.status(500).json({error:'Failed to fetch join requests'});
    }
 });
 // Route to get join requests sent by the user
router.get('/sent-user-requests', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        // Find requests where the sender is the current user
        const sentRequests = await TeamRequest.find({ sender: userId })
            .populate('recipient', 'name email rollNo college')  // Populate recipient details
            .lean();

        res.json(sentRequests);

    } catch (error) {
        console.error('Error fetching sent requests:', error.message);
        res.status(500).json({ error: 'Failed to fetch sent requests' });
    }
});

// Send a join request to form a team

// Route to send a join request and assign team lead
router.post('/send-request', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;  // ID of the sender
        const { recipientIds, teamName } = req.body;

        if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
            return res.status(400).json({ error: 'Recipient IDs must be an array and cannot be empty.' });
        }

        // Check if sender is already in a team
        let senderTeam = await Team.findOne({ students: userId });
        if (!senderTeam) {
            // Check if the team name is unique if provided by the sender
            if (teamName) {
                const existingTeam = await Team.findOne({ name: teamName });
                if (existingTeam) return res.status(400).json({ error: 'A team with this name already exists.' });
            } else {
                return res.status(400).json({ error: 'Team name is required.' });
            }

            // Create a new team for the sender and set them as the team lead
            senderTeam = new Team({
                name: teamName,
                students: [userId], // Start with the sender as the only member
                teamLead: userId // Assign sender as the team lead
            });

            await senderTeam.save();
        } else {
            return res.status(400).json({ error: 'You are already in a team.' });
        }

        // Check if adding recipients would exceed the maximum team size of 4 members
        if (recipientIds.length + senderTeam.students.length > 4) {
            return res.status(400).json({ error: 'A team can have a maximum of 4 members.' });
        }

        // Process each recipient and create requests only if they are not in a team
        for (const recipientId of recipientIds) {
            const recipientTeam = await Team.findOne({ students: recipientId });
            if (recipientTeam) {
                return res.status(400).json({ error: `Recipient ${recipientId} is already in a team.` });
            }

            // Create a join request for each recipient
            const request = new TeamRequest({
                sender: userId,
                recipient: recipientId,
                status: 'pending',
                teamName: senderTeam.name,
                teamId: senderTeam._id
            });
            await request.save();
        }

        



        res.status(201).json({ message: 'Join requests sent successfully', teamDetails: senderTeam });
    } catch (error) {
        console.error('Error sending join request:', error.message);
        res.status(500).json({ error: 'Failed to send join request' });
    }
});

// Reject a join request
router.post('/reject-request', authenticateToken, async (req, res) => {
    try {
        const { requestId } = req.body;

        if (!requestId) return res.status(400).json({ error: 'Request ID is required.' });

        const request = await TeamRequest.findById(requestId);

        if (!request) return res.status(404).json({ error: 'Request not found.' });

        if (request.status !== 'pending') return res.status(400).json({ error: 'Request has already been processed.' });

        request.status = 'rejected';
        await request.save();

        res.status(200).json({ message: 'Request rejected successfully' });
    } catch (error) {
        console.error('Error rejecting request:', error.message);
        res.status(500).json({ error: 'Failed to reject request' });
    }
});

router.get('/available-students', authenticateToken, async (req, res) => {
    try {
        const { search } = req.query;
        const userId = req.user.userId; // Get the logged-in user ID
        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { rollNo: { $regex: search, $options: "i" } }
            ];
        }

        // Find all students matching the search criteria, excluding the logged-in user
        const students = await Student.find({ ...query, _id: { $ne: userId } })
            .select('name email rollNo college createdAt')
            .lean();

        // Find teams for these students
        const teams = await Team.find({
            students: { $in: students.map(s => s._id) }
        })
        .populate('teamLead', 'name email')
        .populate('students', 'name email')
        .lean();

        // Create a map of student teams and team vacancies
        const teamMap = teams.reduce((acc, team) => {
            team.students.forEach(student => {
                acc[student._id.toString()] = {
                    teamId: team._id,
                    teamName: team.name,
                    teamLead: team.teamLead,
                    vacancies: TEAM_SIZE_LIMIT - team.students.length
                };
            });
            return acc;
        }, {});

        // Add team information to each student
        const studentsWithTeamInfo = students.map(student => ({
            ...student,
            teamInfo: teamMap[student._id.toString()] || null,
            inTeam: !!teamMap[student._id.toString()]
        }));

        res.json({ students: studentsWithTeamInfo });
    } catch (error) {
        console.error('Error fetching available students:', error.message);
        res.status(500).json({ error: 'Failed to fetch available students' });
    }
});




router.get('/team-join-requests', authenticateToken, async (req, res) => {
    try {
        const teamLeadId = req.user.userId;
        
        // Find team where user is team lead
        const team = await Team.findOne({ teamLead: teamLeadId });
        if (!team) {
            return res.json({ requests: [] });
        }

        // Get pending requests for the team with populated sender details
        const requests = await teamjoinRequest.find({
            teamId: team._id,
            status: 'pending',
            type: 'join_team'
        })
        .populate('sender', 'name email rollNo college')
        .populate('teamId', 'name description')
        .sort({ createdAt: -1 })
        .lean();

        res.json({ requests });
    } catch (error) {
        console.error('Error fetching team join requests:', error.message);
        res.status(500).json({ error: 'Failed to fetch join requests' });
    }
});

// Accept join request (Team Lead only)
router.post('/accept-join-request', authenticateToken, async (req, res) => {
    try {
        const teamLeadId = req.user.userId;
        const { requestId } = req.body;

        // Find request and populate necessary fields
        const request = await teamjoinRequest.findById(requestId)
            .populate('sender')
            .populate('teamId');

        if (!request) {
            return res.status(404).json({ error: 'Request not found.' });
        }

        // Verify team lead
        const team = await Team.findById(request.teamId);
        if (!team || team.teamLead.toString() !== teamLeadId) {
            return res.status(403).json({ error: 'Only team lead can accept requests.' });
        }

        // Check if request is still pending
        if (request.status !== 'pending') {
            return res.status(400).json({ error: 'This request has already been processed.' });
        }

        // Check team size
        const TEAM_SIZE_LIMIT = 4;
        if (team.students.length >= TEAM_SIZE_LIMIT) {
            request.status = 'rejected';
            await request.save();
            return res.status(400).json({ error: 'Team is already full.' });
        }

        // Add member to team
        team.students.push(request.sender._id);
        await team.save();

        // Update request status
        request.status = 'accepted';
        await request.save();

        res.json({ 
            message: 'Join request accepted successfully',
            team: team
        });
    } catch (error) {
        console.error('Error accepting join request:', error.message);
        res.status(500).json({ error: 'Failed to accept join request' });
    }
});


// Add a student to an existing team
router.post('/add-student', authenticateToken, async (req, res) => {
    try {
        const senderId = req.user.userId;
        const { studentIds } = req.body;

        // Find sender's team
        let currentUserTeam = await Team.findOne({ students: senderId });
        if (!currentUserTeam) {
            return res.status(404).json({ error: 'You are not part of any active teams.' });
        }

        let totalMembers = currentUserTeam.students.length + studentIds.length;
        if (totalMembers > 4) {
            return res.status(400).json({ error: 'Cannot add more members. A maximum of four members is allowed.' });
        }

        // Create requests for each student
        const requests = [];
        for (const studentId of studentIds) {
            // Check if student is already in a team
            let studentTeam = await Team.findOne({ students: { $in: [studentId] } });
            if (studentTeam) {
                return res.status(400).json({
                    error: `Student ${studentId} is already part of another active team.`
                });
            }

            // Check if there's already a pending request
            const existingRequest = await TeamRequest.findOne({
                recipient: studentId,
                teamId: currentUserTeam._id,
                status: 'pending'
            });

            if (existingRequest) {
                return res.status(400).json({
                    error: `A pending request already exists for student ${studentId}`
                });
            }

            // Create new request
            const request = new TeamRequest({
                sender: senderId,
                recipient: studentId,
                teamId: currentUserTeam._id,
                teamName: currentUserTeam.name,
                status: 'pending'
            });
            await request.save();
            requests.push(request);
        }

        res.status(200).json({
            message: 'Team join requests sent successfully',
            requests: requests
        });
    } catch (err) {
        console.log(err.message);
        return res.status(500).json({
            error: 'Internal server error occurred.'
        });
    }
});



// Function to delete accepted and rejected requests
const deleteAcceptedRejectedRequests = async () => {
    try {
        // Delete requests with status 'accepted' or 'rejected'
        const result = await TeamRequest.deleteMany({
            status: { $in: ['accepted', 'rejected'] }
        });
        const result1 = await teamjoinRequest.deleteMany({
            status: { $in: ['accepted', 'rejected'] }
        });

    } catch (error) {
        console.error('Error deleting team requests:', error.message);
    }
};

router.delete('/delete-requests', async (req, res) => {
    try {
        const message = await deleteAcceptedRejectedRequests();
        res.status(200).json({ message });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


 
// Reject join request (Team Lead only)
router.post('/reject-join-request', authenticateToken, async (req, res) => {
    try {
        const teamLeadId = req.user.userId;
        const { requestId } = req.body;
        const request = await teamjoinRequest.findById(requestId)
            .populate('teamId');
        if (!request) {
            return res.status(404).json({ error: 'Request not found.' });
        }
        // Verify team lead
        const team = await Team.findById(request.teamId);
        if (!team || team.teamLead.toString() !== teamLeadId) {
            return res.status(403).json({ error: 'Only team lead can reject requests.' });
        }
        // Update request status
        request.status = 'rejected';
        await request.save();
        res.json({ message: 'Join request rejected successfully' });
    } catch (error) {
        console.error('Error rejecting join request:', error.message);
        res.status(500).json({ error: 'Failed to reject join request' });
    }
});




// Send join request to a team
router.post('/send-join-request', authenticateToken, async (req, res) => {
    try {
        const senderId = req.user.userId;
        const { teamId, message } = req.body;

        // Step 1: Check if sender is already in a team
        const senderTeam = await Team.findOne({ students: senderId });
        if (senderTeam) {
            return res.status(400).json({ error: 'You are already in a team.' });
        }

        // Step 2: Get the target team and check if it exists
        const targetTeam = await Team.findById(teamId)
            .populate('teamLead', 'name email')
            .populate('students', 'name email');

        if (!targetTeam) {
            return res.status(404).json({ error: 'Team not found.' });
        }

        // Step 3: Check if the team has a vacancy
        const TEAM_SIZE_LIMIT = 4; // Adjust based on your requirements
        if (targetTeam.students.length >= TEAM_SIZE_LIMIT) {
            return res.status(400).json({ error: 'Team is already full.' });
        }

        // Step 4: Check if there's already a pending request
        const existingRequest = await teamjoinRequest.findOne({
            sender: senderId,
            teamId: teamId,
            status: 'pending',
            type: 'join_team'
        });

        if (existingRequest) {
            return res.status(400).json({ error: 'You already have a pending request for this team.' });
        }

        // Step 5: Create new join request
        const request = new teamjoinRequest({
            sender: senderId,
            recipient: targetTeam.teamLead._id,
            teamId: teamId,
            status: 'pending'
        });

        await request.save();

        res.json({ message: 'Join request sent successfully', requestId: request._id });
    } catch (error) {
        console.error('Error sending join request:', error);
        res.status(500).json({ error: 'Failed to send join request' });
    }
});

// Get received team requests
router.get('/received-requests', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        // Find all requests where the current user is the recipient and status is pending
        const requests = await teamjoinRequest.find({
            recipient: userId,
            status: 'pending'
        })
        .populate('sender', 'name email') // Populate sender details
        .populate('teamId', 'name description') // Populate team details
        .sort({ createdAt: -1 }); // Sort by newest first

        res.json(requests);
    } catch (error) {
        console.error('Error fetching received requests:', error);
        res.status(500).json({ error: 'Failed to fetch received requests' });
    }
});


// Add this endpoint to your backend router
router.get('/sent-join-requests', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        
        // Find all join requests sent by the current user with pending status
        const requests = await TeamRequest.find({
            sender: userId,
            status: 'pending'
        })
        .populate('recipient', 'name email')
        .populate('teamId', 'name description')
        .sort({ createdAt: -1 });

        res.json(requests);
    } catch (error) {
        console.error('Error fetching sent join requests:', error);
        res.status(500).json({ error: 'Failed to fetch sent join requests' });
    }
});

// Fetch all team requests
router.get('/all-team-requests', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Fetch all team requests where the user is either the sender or recipient
        const teamRequests = await teamjoinRequest.find({
            $or: [{ sender: userId }, { recipient: userId }]
        }).lean();

        res.json(teamRequests);
        console.log("teamrequests",teamRequests)
    } catch (error) {
        console.error('Error fetching team requests:', error.message);
        res.status(500).json({ error: 'Failed to fetch team requests' });
    }
});

module.exports = router;