const router = require('express').Router();
const Feedback = require('../models/feedback');
const { authenticateToken } = require('../middleware/auth');

// Get user's feedback for their mentor
router.get('/my-feedback', authenticateToken, async (req, res) => {
  try {
    const feedback = await Feedback.findOne({
      studentId: req.user.userId,
    }).populate('mentorId', 'name email');
    res.json(feedback);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit or update feedback
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const { mentorId, rating, feedback } = req.body;
    const studentId = req.user.userId;

    let existingFeedback = await Feedback.findOne({ studentId, mentorId });

    if (existingFeedback) {
      existingFeedback.rating = rating;
      existingFeedback.feedback = feedback;
      existingFeedback.updatedAt = Date.now();
      await existingFeedback.save();
      res.json({
        message: 'Feedback updated successfully',
        feedback: existingFeedback,
      });
    } else {
      const newFeedback = new Feedback({
        studentId,
        mentorId,
        rating,
        feedback,
      });
      await newFeedback.save();
      res.json({
        message: 'Feedback submitted successfully',
        feedback: newFeedback,
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get feedback for a mentor (admin only)
router.get('/mentor/:mentorId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const feedbacks = await Feedback.find({ mentorId: req.params.mentorId })
      .populate('studentId', 'name email')
      .populate('mentorId', 'name email');
    res.json(feedbacks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
