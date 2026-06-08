const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Event = require('../models/event');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errorHandler');

const VALID_RECIPIENTS = ['all', 'student', 'mentor', 'admin'];

// Middleware to build role-based filter
const getRoleFilter = (role) => {
  const filterMap = {
    student: { recipients: { $in: ['all', 'student'] } },
    mentor: { recipients: { $in: ['all', 'mentor'] } },
    admin: { recipients: { $in: ['all', 'admin'] } },
    default: { recipients: 'all' }
  };
  return filterMap[role] || filterMap.default;
};

// GET all events (filtered by user role) - OPTIMIZED
router.get('/events', authenticateToken, asyncHandler(async (req, res) => {
  const { role } = req.user;
  const roleFilter = getRoleFilter(role);

  const events = await Event.find(roleFilter)
    .select('title date description meeting recipients createdBy createdAt')
    .sort({ date: 1, createdAt: 1 })
    .lean()
    .limit(1000);

  res.json({
    success: true,
    message: 'Events fetched successfully',
    data: events,
  });
}));

// GET all events for admin (no filtering) - OPTIMIZED
router.get('/admin', authenticateToken, requireRole(['admin']), asyncHandler(async (req, res) => {
  const events = await Event.find({})
    .select('title date description meeting recipients createdBy createdByRole createdAt updatedAt')
    .sort({ date: 1, createdAt: 1 })
    .lean()
    .limit(1000);

  res.json({
    success: true,
    message: 'All events fetched (admin)',
    data: events,
  });
}));

// GET events by date - OPTIMIZED
router.get('/date/:date', authenticateToken, asyncHandler(async (req, res) => {
  const { role } = req.user;
  const { date } = req.params;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid date format. Use YYYY-MM-DD'
    });
  }

  const filter = { date };
  
  if (role !== 'admin') {
    Object.assign(filter, getRoleFilter(role));
  }

  const events = await Event.find(filter)
    .select('title date description meeting recipients createdBy createdAt')
    .sort({ createdAt: 1 })
    .lean();

  if (!events || events.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No events found for this date'
    });
  }

  res.json({
    success: true,
    message: 'Events fetched for date',
    data: events,
  });
}));

// POST new event (admin only) - OPTIMIZED
router.post('/', authenticateToken, requireRole(['admin']), asyncHandler(async (req, res) => {
  const { title, date, description, meeting, recipients } = req.body;

  // Validation
  if (!title || !title.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Title is required'
    });
  }

  if (!description || !description.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Description is required'
    });
  }

  if (!date) {
    return res.status(400).json({
      success: false,
      message: 'Date is required'
    });
  }

  if (recipients && !VALID_RECIPIENTS.includes(recipients)) {
    return res.status(400).json({
      success: false,
      message: `Invalid recipients. Must be one of: ${VALID_RECIPIENTS.join(', ')}`
    });
  }

  const newEvent = new Event({
    title: title.trim(),
    date,
    description: description.trim(),
    meeting: meeting ? meeting.trim() : '',
    recipients: recipients || 'all',
    createdBy: req.user.userId,
    createdByRole: req.user.role,
    createdAt: new Date()
  });

  await newEvent.save();

  res.status(201).json({
    success: true,
    message: 'Event created successfully',
    data: newEvent,
  });
}));

// PUT update event by ID (admin only) - OPTIMIZED
router.put('/:id', authenticateToken, requireRole(['admin']), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, meeting, recipients } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid event ID'
    });
  }

  // Validation
  if (title && !title.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Title cannot be empty'
    });
  }

  if (description && !description.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Description cannot be empty'
    });
  }

  if (recipients && !VALID_RECIPIENTS.includes(recipients)) {
    return res.status(400).json({
      success: false,
      message: `Invalid recipients. Must be one of: ${VALID_RECIPIENTS.join(', ')}`
    });
  }

  const updateData = {};
  if (title) updateData.title = title.trim();
  if (description) updateData.description = description.trim();
  if (meeting) updateData.meeting = meeting.trim();
  if (recipients) updateData.recipients = recipients;
  updateData.updatedBy = req.user.userId;
  updateData.updatedAt = new Date();

  const updatedEvent = await Event.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true
  });

  if (!updatedEvent) {
    return res.status(404).json({
      success: false,
      message: 'Event not found'
    });
  }

  res.json({
    success: true,
    message: 'Event updated successfully',
    data: updatedEvent,
  });
}));

// DELETE event by ID (admin only) - OPTIMIZED
router.delete('/:id', authenticateToken, requireRole(['admin']), asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid event ID'
    });
  }

  const deletedEvent = await Event.findByIdAndDelete(id);

  if (!deletedEvent) {
    return res.status(404).json({
      success: false,
      message: 'Event not found'
    });
  }

  res.json({
    success: true,
    message: 'Event deleted successfully',
  });
}));

// GET event statistics (admin only) - OPTIMIZED with aggregation
router.get('/stats/all', authenticateToken, requireRole(['admin']), asyncHandler(async (req, res) => {
  const [totalEvents, eventsByRecipient, upcomingEvents] = await Promise.all([
    Event.countDocuments(),
    Event.aggregate([
      {
        $group: {
          _id: '$recipients',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]),
    Event.countDocuments({
      date: { $gte: new Date().toISOString().split('T')[0] }
    })
  ]);

  res.json({
    success: true,
    message: 'Event statistics retrieved',
    data: {
      totalEvents,
      eventsByRecipient,
      upcomingEvents,
      pastEvents: totalEvents - upcomingEvents
    }
  });
}));

// GET single event by ID - OPTIMIZED
router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid event ID'
    });
  }

  const event = await Event.findById(id).lean();

  if (!event) {
    return res.status(404).json({
      success: false,
      message: 'Event not found'
    });
  }

  res.json({
    success: true,
    message: 'Event retrieved successfully',
    data: event,
  });
}));

module.exports = router;