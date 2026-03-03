const express = require('express');
const router = express.Router();
const MentorFeedback = require('../Models/mentorfeedback');
const Team = require('../Models/hackteam');
const HackRegister = require('../Models/hack-reg');

const { authenticateStudentToken } = require('../../middleware/auth');

// Submit or Update Mentor Feedback
router.post('/feedback/mentor', authenticateStudentToken, async (req, res) => {
  try {
    const studentId = req.student?._id || req.student?.id || req.studentId;
    console.log('Determined studentId:', studentId);
    
    if (!studentId) {
      return res.status(401).json({ 
        error: 'Authentication failed: Student ID not found' 
      });
    }

    const { mentorId, hackathonId, rating, feedback } = req.body;

    // Validate required fields
    if (!mentorId || !hackathonId || !rating) {
      return res.status(400).json({ 
        error: 'Mentor, hackathon, and rating are required' 
      });
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ 
        error: 'Rating must be between 1 and 5' 
      });
    }

    // Find the hackathon registration that contains this student
    console.log('🔍 Searching for registration with:');
    console.log('  hackathonId:', hackathonId);
    console.log('  studentId:', studentId);

    const registration = await HackRegister.findOne({
      hackathon: hackathonId,
      'students.student': studentId,
      'students.status': 'approved'
    });

    console.log('📋 Registration found:', registration ? 'YES' : 'NO');

    if (!registration) {
      return res.status(404).json({ 
        error: 'You are not registered or approved for this hackathon'
      });
    }

    // Find the registration subdocument ID for this student
    const studentRegistrationId = registration.students.find(
      s => s.student.toString() === studentId.toString()
    )?._id;

    if (!studentRegistrationId) {
      return res.status(404).json({ 
        error: 'Could not find your registration ID' 
      });
    }

    console.log('✅ Student Registration ID:', studentRegistrationId);

    // Find the student's team for this hackathon using registration ID
    const team = await Team.findOne({ 
      hackathon: hackathonId,
      students: studentRegistrationId
    });

    console.log('🏆 Team found:', team ? 'YES' : 'NO');
    if (team) {
      console.log('   Team name:', team.name);
      console.log('   Has mentor:', !!team.mentor);
    }

    if (!team) {
      return res.status(404).json({ 
        error: 'You are not part of a team in this hackathon' 
      });
    }

    // Check if the mentor is assigned to the team
    if (!team.mentor || team.mentor.toString() !== mentorId) {
      return res.status(403).json({ 
        error: 'You can only provide feedback for your assigned mentor' 
      });
    }

    // Use findOneAndUpdate with upsert to create or update
    const updatedFeedback = await MentorFeedback.findOneAndUpdate(
      { hackathon: hackathonId, mentor: mentorId, student: studentId },
      { 
        rating, 
        feedback: feedback || '',
        updatedAt: new Date()
      },
      { 
        new: true, 
        upsert: true,
        runValidators: true
      }
    );

    const isNew = !updatedFeedback.createdAt || 
      (updatedFeedback.updatedAt - updatedFeedback.createdAt < 1000);

    res.status(isNew ? 201 : 200).json({
      message: isNew ? 'Feedback submitted successfully' : 'Feedback updated successfully',
      feedback: updatedFeedback
    });

  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get My Feedback for a Mentor
router.get('/feedback/mentor/:mentorId', authenticateStudentToken, async (req, res) => {
  try {
    const studentId = req.student?._id || req.student?.id || req.studentId;
    
    if (!studentId) {
      return res.status(401).json({ 
        error: 'Authentication failed: Student ID not found' 
      });
    }

    const { mentorId } = req.params;
    const { hackathonId } = req.query;

    if (!hackathonId) {
      return res.status(400).json({ error: 'Hackathon ID is required' });
    }

    const feedback = await MentorFeedback.findOne({
      hackathon: hackathonId,
      mentor: mentorId,
      student: studentId
    })
    .populate('student', 'name rollNo email')
    .populate('mentor', 'name email')
    .populate('hackathon', 'name');

    res.status(200).json(feedback || null);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get My Assigned Mentor for Current Hackathon
router.get('/my-mentor', authenticateStudentToken, async (req, res) => {
  try {
    const studentId = req.student?._id || req.student?.id || req.studentId;
    
    if (!studentId) {
      return res.status(401).json({ 
        error: 'Authentication failed: Student ID not found' 
      });
    }

    const { hackathonId } = req.query;

    if (!hackathonId) {
      return res.status(400).json({ error: 'Hackathon ID is required' });
    }

    // Verify the student is registered and approved for this hackathon
    const registration = await HackRegister.findOne({
      hackathon: hackathonId,
      'students.student': studentId,
      'students.status': 'approved'
    });

    if (!registration) {
      return res.status(404).json({ 
        error: 'You are not registered or approved for this hackathon' 
      });
    }

    // Find the registration subdocument ID for this student
    const studentRegistrationId = registration.students.find(
      s => s.student.toString() === studentId.toString()
    )?._id;

    if (!studentRegistrationId) {
      return res.status(404).json({ 
        error: 'Could not find your registration ID' 
      });
    }

    // Find team using registration ID
    const team = await Team.findOne({
      hackathon: hackathonId,
      students: studentRegistrationId
    })
    .populate('mentor', 'name email github linkedin')
    .populate('hackathon', 'name');

    if (!team) {
      return res.status(404).json({ error: 'You are not part of a team' });
    }

    if (!team.mentor) {
      return res.status(404).json({ error: 'No mentor assigned to your team yet' });
    }

    // Check if feedback already exists
    const existingFeedback = await MentorFeedback.findOne({
      hackathon: hackathonId,
      mentor: team.mentor._id,
      student: studentId
    });

    res.status(200).json({
      mentor: team.mentor,
      team: {
        _id: team._id,
        name: team.name
      },
      hackathon: team.hackathon,
      hasFeedback: !!existingFeedback,
      feedback: existingFeedback
    });
  } catch (error) {
    console.error('Error fetching mentor:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get All Feedback for a Mentor (For Mentors/Admins)
router.get('/mentor/:mentorId/all-feedback', async (req, res) => {
  try {
    const { mentorId } = req.params;
    const { hackathonId } = req.query;

    const query = { mentor: mentorId };
    if (hackathonId) {
      query.hackathon = hackathonId;
    }

    const feedbacks = await MentorFeedback.find(query)
      .populate('student', 'name rollNo email')
      .populate('mentor', 'name email')
      .populate('hackathon', 'name')
      .sort({ updatedAt: -1 });

    // Calculate statistics
    const totalFeedbacks = feedbacks.length;
    if (totalFeedbacks === 0) {
      return res.status(200).json({
        feedbacks: [],
        statistics: {
          totalFeedbacks: 0,
          averageRating: 0,
          ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        }
      });
    }

    const avgRating = (feedbacks.reduce((sum, f) => sum + f.rating, 0) / totalFeedbacks).toFixed(2);
    
    const ratingDistribution = {
      5: feedbacks.filter(f => f.rating === 5).length,
      4: feedbacks.filter(f => f.rating === 4).length,
      3: feedbacks.filter(f => f.rating === 3).length,
      2: feedbacks.filter(f => f.rating === 2).length,
      1: feedbacks.filter(f => f.rating === 1).length
    };

    res.status(200).json({
      feedbacks,
      statistics: {
        totalFeedbacks,
        averageRating: parseFloat(avgRating),
        ratingDistribution
      }
    });
  } catch (error) {
    console.error('Error fetching mentor feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete Feedback
router.delete('/feedback/mentor/:mentorId', authenticateStudentToken, async (req, res) => {
  try {
    const studentId = req.student?._id || req.student?.id || req.studentId;
    
    if (!studentId) {
      return res.status(401).json({ 
        error: 'Authentication failed: Student ID not found' 
      });
    }

    const { mentorId } = req.params;
    const { hackathonId } = req.query;

    if (!hackathonId) {
      return res.status(400).json({ error: 'Hackathon ID is required' });
    }

    const result = await MentorFeedback.findOneAndDelete({
      hackathon: hackathonId,
      mentor: mentorId,
      student: studentId
    });

    if (!result) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    res.status(200).json({ message: 'Feedback deleted successfully' });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.status(500).json({ error: error.message });
  }
});





// Add this to your hackmentorfeedback routes file
// Get All Feedback for all mentors in a hackathon (For viewing all feedback)
router.get('/mentor/all/feedback', async (req, res) => {
  try {
    const { hackathonId } = req.query;

    const query = hackathonId ? { hackathon: hackathonId } : {};

    const feedbacks = await MentorFeedback.find(query)
      .populate('student', 'name rollNo email branch')
      .populate('mentor', 'name email')
      .populate('hackathon', 'name')
      .sort({ updatedAt: -1 });

    // Calculate statistics
    const totalFeedbacks = feedbacks.length;
    if (totalFeedbacks === 0) {
      return res.status(200).json({
        feedbacks: [],
        statistics: {
          totalFeedbacks: 0,
          averageRating: 0,
          ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
        }
      });
    }

    const avgRating = (feedbacks.reduce((sum, f) => sum + f.rating, 0) / totalFeedbacks).toFixed(2);
    
    const ratingDistribution = {
      5: feedbacks.filter(f => f.rating === 5).length,
      4: feedbacks.filter(f => f.rating === 4).length,
      3: feedbacks.filter(f => f.rating === 3).length,
      2: feedbacks.filter(f => f.rating === 2).length,
      1: feedbacks.filter(f => f.rating === 1).length
    };

    res.status(200).json({
      feedbacks,
      statistics: {
        totalFeedbacks,
        averageRating: parseFloat(avgRating),
        ratingDistribution
      }
    });
  } catch (error) {
    console.error('Error fetching all feedback:', error);
    res.status(500).json({ error: error.message });
  }
});




module.exports = router;