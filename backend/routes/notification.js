const express = require('express');
const router = express.Router();
const Notification = require('../models/notification');
const { authenticateToken } = require('../middleware/auth');

// Get notifications for logged-in user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Filter notifications based on user role
    const notifications = await Notification.find({
      $or: [
        { targetAudience: 'all' },
        { targetAudience: userRole + 's' } // converts 'student' to 'students' etc.
      ]
    })
    .sort({ createdAt: -1 })
    .lean();

    // Add read status for each notification
    const notificationsWithReadStatus = notifications.map(notification => ({
      ...notification,
      read: notification.readBy.some(id => id.toString() === userId.toString())
    }));

    res.json(notificationsWithReadStatus);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new notification (admin only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can create notifications' });
    }

    const { title, description, targetAudience } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const notification = new Notification({
      title,
      description,
      targetAudience: targetAudience || 'all',
      readBy: []
    });

    await notification.save();

    // Emit socket event with target audience info
    req.app.get('io').emit('newNotification', {
      ...notification.toObject(),
      targetAudience: notification.targetAudience
    });

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark notifications as read for logged-in user
router.put('/markAsRead', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Update all unread notifications for this user's role
    await Notification.updateMany(
      {
        readBy: { $ne: userId },
        $or: [
          { targetAudience: 'all' },
          { targetAudience: userRole + 's' }
        ]
      },
      { $addToSet: { readBy: userId } }
    );

    res.json({ message: 'Notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;