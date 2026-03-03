const express = require('express');
const router = express.Router();
const HackMentor = require('../Models/Hackmentor');
const { authenticateToken, requireRole } = require('../../middleware/auth');

// GET all hack mentors with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const hackMentors = await HackMentor.find()
      .skip(skip)
      .limit(limit)
      .populate('hackathon', 'hackathonname description startdate enddate technology college year location status entryfee firstprize secondprize thirdprize minteam maxteam')
      .populate('mentors.mentor', 'name email github linkedin')
      .populate('mentors.approvedBy', 'name email');

    const total = await HackMentor.countDocuments();

    res.json({
      total,
      page,
      pages: Math.ceil(total / limit),
      hackMentors
    });
  } catch (error) {
    console.error('Error fetching hack mentors:', error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
});

router.get('/mentor/:mentorId', authenticateToken, async (req, res) => {
  try {
    const { mentorId } = req.params;

    // Find all hackathons where this mentor has made requests
    const hackMentors = await HackMentor.find({
      'mentors.mentor': mentorId
    })
    .populate('hackathon', 'hackathonname description startdate enddate technology college year location status entryfee firstprize secondprize thirdprize minteam maxteam')
    .populate('mentors.mentor', 'name email github linkedin')
    .populate('mentors.approvedBy', 'name email');

    // Filter to only return the relevant mentor requests
    const mentorRequests = hackMentors.map(hackMentor => {
      const mentorRequest = hackMentor.mentors.find(
        m => m.mentor._id.toString() === mentorId
      );
      
      return {
        hackathon: hackMentor.hackathon,
        mentorRequest: mentorRequest
      };
    }).filter(item => item.mentorRequest); // Only return items where mentorRequest exists

    res.json(mentorRequests);
  } catch (error) {
    console.error('Error fetching mentor requests for mentor:', error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
});


// Request a mentor
router.post('/:hackathonId/request', authenticateToken, async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const { mentorId } = req.body;
    const requestedBy = { id: req.user.userId, role: req.user.role };

    if (!mentorId) {
      return res.status(400).json({ message: 'Mentor ID is required' });
    }

    let hackMentor = await HackMentor.findOne({ hackathon: hackathonId });
    if (!hackMentor) {
      hackMentor = new HackMentor({ hackathon: hackathonId, mentors: [] });
    }

    const existingRequest = hackMentor.mentors.find(
      m => m.mentor.toString() === mentorId
    );

    if (existingRequest) {
      return res.status(400).json({
        message: 'Mentor request already exists',
        status: existingRequest.status
      });
    }

    hackMentor.mentors.push({
      mentor: mentorId,
      requestedBy,
      status: 'pending'
    });
 
    await hackMentor.save();
    await hackMentor.populate('mentors.mentor', 'name email github linkedin');

    res.status(201).json({
      message: 'Mentor request submitted successfully',
      hackMentor
    });
  } catch (error) {
    console.error('Error creating mentor request:', error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
});

// Approve/Reject/Pending
router.put('/:hackathonId/mentors/:mentorRequestId/status', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { hackathonId, mentorRequestId } = req.params;
    const { status } = req.body;
    const approvedBy = req.user.userId;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const hackMentor = await HackMentor.findOne({ hackathon: hackathonId });
    if (!hackMentor) {
      return res.status(404).json({ message: 'Hackathon mentor record not found' });
    }

    const mentorRequest = hackMentor.mentors.id(mentorRequestId);
    if (!mentorRequest) {
      return res.status(404).json({ message: 'Mentor request not found' });
    }

    mentorRequest.status = status;
    mentorRequest.approvedAt = new Date();
    mentorRequest.approvedBy = approvedBy;

    await hackMentor.save();
    await hackMentor.populate('mentors.mentor', 'name email github linkedin');
    await hackMentor.populate('mentors.approvedBy', 'name email');

    res.json({ message: `Mentor request ${status} successfully`, mentorRequest });
  } catch (error) {
    console.error('Error updating mentor request status:', error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
});

// Get mentor requests by hackathon (empty = [])
router.get('/:hackathonId/mentors', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const { status } = req.query;

    const hackMentor = await HackMentor.findOne({ hackathon: hackathonId })
      .populate('mentors.mentor', 'name email phoneNumber github linkedin')
      .populate('mentors.approvedBy', 'name email');

    // if hackathon record itself doesn't exist → 404
    if (!hackMentor) {
      return res.json({ total: 0, status: status || 'all', mentorRequests: [] });
    }

    let mentorRequests = hackMentor.mentors || [];

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      mentorRequests = mentorRequests.filter(m => m.status === status);
    }

    res.json({
      total: mentorRequests.length,
      status: status || 'all',
      mentorRequests
    });
  } catch (error) {
    console.error('Error fetching mentor requests by status:', error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
});

router.put('/:hackathonId/assign/:mentorId', authenticateToken, requireRole(['coordinator']), async (req, res) => {
  try {
    const { hackathonId, mentorId } = req.params;
    const { assignto } = req.body;
    const assignedby = req.user.userId;

    // 1. Find the HackMentor document
    const hackMentorDoc = await HackMentor.findOne({ hackathon: hackathonId });
    if (!hackMentorDoc) {
      return res.status(404).json({ message: 'Hackathon not found' });
    }

    // 2. Find mentor request inside the array
    const mentorRequest = hackMentorDoc.mentors.id(mentorId);
    if (!mentorRequest) {
      return res.status(404).json({ message: 'Mentor request not found for this hackathon' });
    }

    // 3. Check if mentor request is approved
    if (mentorRequest.status !== "approved") {
      return res.status(400).json({ message: 'Only approved mentor requests can be assigned' });
    }

    // 4. Update assignment fields
    mentorRequest.assignto = assignto;
    mentorRequest.assignedby = assignedby;
    mentorRequest.assignedAt = new Date();

    await hackMentorDoc.save();

    return res.status(200).json({
      message: 'Mentor assigned successfully',
      mentorRequest
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: 'Error in Assign Mentor',
      error: err.message
    });
  }
});


module.exports = router;
