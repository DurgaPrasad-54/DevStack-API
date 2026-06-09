const express = require('express');
const router = express.Router();
const Event = require('../models/event'); // Ensure the correct path
const { authenticateToken, requireRole } = require('../middleware/auth'); // Adjust path as needed

// GET all events (filtered by user role)
router.get('/events', authenticateToken, async (req, res) => {
    try {
        const userRole = req.user.role;
        let filter = {};

        // Filter events based on user role
        if (userRole === 'student') {
            filter = { recipients: { $in: ['all', 'student'] } };
        } else if (userRole === 'mentor') {
            filter = { recipients: { $in: ['all', 'mentor'] } };
        } else if (userRole === 'admin') {
            filter = { recipients: { $in: ['all', 'admin'] } }; // Admins see 'all' and 'admin'
        } else {
            filter = { recipients: 'all' };
        }

        const events = await Event.find(filter).sort({ date: 1, createdAt: 1 });
        res.status(200).json(events);
        console.log(`Events fetched for ${userRole} user:`, events); // Debug log
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET all events for admin (no filtering) - separate endpoint for admin panel
router.get('/events/admin', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const events = await Event.find().sort({ date: 1, createdAt: 1 });
        res.status(200).json(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET events by date (for specific date queries) - Now returns array of events
router.get('/events/date/:date', authenticateToken, async (req, res) => {
    try {
        const userRole = req.user.role;
        const targetDate = req.params.date;
        
        let filter = { date: targetDate };
        
        // Apply role-based filtering
        if (userRole === 'student') {
            filter.recipients = { $in: ['all', 'student'] };
        } else if (userRole === 'mentor') {
            filter.recipients = { $in: ['all', 'mentor'] };
        } else if (userRole !== 'admin') {
            filter.recipients = 'all';
        }
        
        const events = await Event.find(filter).sort({ createdAt: 1 });
        
        if (!events || events.length === 0) {
            return res.status(404).json({ message: 'No events found for this date' });
        }
        
        res.status(200).json(events);
    } catch (error) {
        console.error('Error fetching events by date:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST new event (admin and mentor only)
router.post('/events', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { title, date, description, meeting, recipients } = req.body;
        
        // Validation
        const errors = {};
        if (!title || !title.trim()) {
            errors.title = 'Title is required';
        }
        if (!description || !description.trim()) {
            errors.description = 'Description is required';
        }
        if (!date) {
            errors.date = 'Date is required';
        }
        
        // Validate recipients
        const validRecipients = ['all', 'student', 'mentor', 'admin'];
        if (recipients && !validRecipients.includes(recipients)) {
            errors.recipients = 'Invalid recipients value. Must be one of: all, student, mentor, admin';
        }
        
        if (Object.keys(errors).length > 0) {
            return res.status(400).json({ errors });
        }
        
        // No longer check for existing events on the same date since we allow multiple events
        
        const newEvent = new Event({
            title: title.trim(),
            date,
            description: description.trim(),
            meeting: meeting ? meeting.trim() : '',
            recipients: recipients || 'all', // Store recipients
            createdBy: req.user.id, // Track who created the event
            createdByRole: req.user.role, // Store the role of creator
            createdAt: new Date()
        });
        
        const savedEvent = await newEvent.save();
        console.log(`Event created by ${req.user.role} user:`, savedEvent); // Debug log
        
        res.status(201).json(savedEvent);
    } catch (error) {
        console.error('Error saving event:', error);
        res.status(400).json({ message: 'Error saving event' });
    }
});

// PUT update event by ID (admin and mentor only)
router.put('/events/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const { title, description, meeting, recipients } = req.body;
        const eventId = req.params.id;
        
        // Validation
        const errors = {};
        if (!title || !title.trim()) {
            errors.title = 'Title is required';
        }
        if (!description || !description.trim()) {
            errors.description = 'Description is required';
        }
        
        // Validate recipients
        const validRecipients = ['all', 'student', 'mentor', 'admin'];
        if (recipients && !validRecipients.includes(recipients)) {
            errors.recipients = 'Invalid recipients value. Must be one of: all, student, mentor, admin';
        }
        
        if (Object.keys(errors).length > 0) {
            return res.status(400).json({ errors });
        }
        
        const updatedEvent = await Event.findByIdAndUpdate(
            eventId,
            {
                title: title.trim(),
                description: description.trim(),
                meeting: meeting ? meeting.trim() : '',
                recipients: recipients || 'all',
                updatedBy: req.user.id, // Track who updated the event
                updatedAt: new Date()
            },
            { new: true }
        );
        
        if (!updatedEvent) {
            return res.status(404).json({ message: 'Event not found' });
        }
        
        console.log(`Event updated by ${req.user.role} user:`, updatedEvent); // Debug log
        
        res.status(200).json(updatedEvent);
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(400).json({ message: 'Error updating event' });
    }
});

// DELETE event by ID (admin and mentor only)
router.delete('/events/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const eventId = req.params.id;
        
        const deletedEvent = await Event.findByIdAndDelete(eventId);
        
        if (!deletedEvent) {
            return res.status(404).json({ message: 'Event not found' });
        }
        
        console.log(`Event deleted by ${req.user.role} user:`, deletedEvent); // Debug log
        
        res.status(200).json({ 
            message: 'Event deleted successfully',
            deletedEvent: deletedEvent 
        });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({ message: 'Error deleting event' });
    }
});

// GET events statistics (admin only)
router.get('/events/stats', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
        const totalEvents = await Event.countDocuments();
        const eventsByRecipient = await Event.aggregate([
            {
                $group: {
                    _id: '$recipients',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        const upcomingEvents = await Event.countDocuments({
            date: { $gte: new Date().toISOString().split('T')[0] }
        });
        
        res.status(200).json({
            totalEvents,
            eventsByRecipient,
            upcomingEvents
        });
    } catch (error) {
        console.error('Error fetching event statistics:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;