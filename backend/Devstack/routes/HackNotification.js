const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const HackNotification = require('../models/HackNotification');

// Get notifications for logged-in user
router.get('/notification', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    let query;
    if (userRole === 'admin') {
      query = {}; // Admin sees all
    } else {
      query = { $or: [{ targetAudience: 'all' }, { targetAudience: userRole + 's' }] };
    }

    const notifications = await HackNotification.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const notificationsWithReadStatus = notifications.map((notification) => ({
      ...notification,
      read: notification.readBy.some((id) => id.toString() === userId.toString()),
    }));

    res.json(notificationsWithReadStatus);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new notification (admin only)
router.post('/notification', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only admins can create notifications' });

    const { title, description, targetAudience } = req.body;
    if (!title || !description) return res.status(400).json({ message: 'Title and description are required' });

    const notification = new HackNotification({
      title,
      description,
      targetAudience: targetAudience || 'all',
      readBy: [],
    });

    await notification.save();

    // Emit to all connected clients
    req.app.get('io').emit('newHackNotification', {
      ...notification.toObject(),
      targetAudience: notification.targetAudience,
    });

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark notification as read (any logged-in user)
router.post('/mark-read/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const notification = await HackNotification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    if (!notification.readBy.includes(userId)) {
      notification.readBy.push(userId);
      await notification.save();

      // Emit event to update other clients
      req.app.get('io').emit('hackNotificationRead', { hackNotificationId: notification._id });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark all notifications as read for logged-in user
router.put('/markAsRead', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Update all unread notifications for this user's role
    await HackNotification.updateMany(
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

// Update notification (admin only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only admins can update notifications' });

    const { title, description, targetAudience } = req.body;
    const notification = await HackNotification.findByIdAndUpdate(
      req.params.id,
      { title, description, targetAudience },
      { new: true }
    );

    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete notification (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Only admins can delete notifications' });

    const notification = await HackNotification.findByIdAndDelete(req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
