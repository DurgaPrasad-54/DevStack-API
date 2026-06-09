const express = require('express');
const router = express.Router();
const Event = require('../models/mentorevents'); // <-- Use MentorEvent model
const Team = require('../models/teams');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Get mentor's assigned teams
const getMentorTeams = async (mentorId) => {
    try {
        const teams = await Team.find({ mentor: mentorId }).populate('students', 'name email');
        return teams;
    } catch (error) {
        throw new Error('Error fetching mentor teams');
    }
};

// Create new event (Mentor only)
router.post('/create', authenticateToken, requireRole(['mentor']), async (req, res) => {
    try {
        const {
            title,
            description,
            eventDate,
            eventTime,
            location,
            eventType,
            maxParticipants,
            requirements
        } = req.body;

        // Get mentor's assigned teams
        const mentorTeams = await getMentorTeams(req.user.userId);
        
        if (mentorTeams.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'You are not assigned to any teams yet.'
            });
        }

        const teamIds = mentorTeams.map(team => team._id);

        const newEvent = new Event({
            title,
            description,
            eventDate: new Date(eventDate),
            eventTime,
            location,
            mentor: req.user.userId,
            assignedTeams: teamIds,
            eventType,
            maxParticipants,
            requirements
        });

        const savedEvent = await newEvent.save();
        
        // Populate the saved event for response
        const populatedEvent = await Event.findById(savedEvent._id)
            .populate('mentor', 'name email')
            .populate('assignedTeams', 'name');

        res.status(201).json({
            success: true,
            message: 'Event created successfully',
            event: populatedEvent
        });

    } catch (error) {
        console.error('Error creating event:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create event',
            error: error.message
        });
    }
});

// Get all events created by mentor
router.get('/my-events', authenticateToken, requireRole(['mentor']), async (req, res) => {
    try {
        const events = await Event.find({ 
            mentor: req.user.userId,
            isActive: true 
        })
        .populate('assignedTeams', 'name')
        .sort({ eventDate: 1 });

        res.json({
            success: true,
            events
        });

    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch events',
            error: error.message
        });
    }
});

// Get mentor's assigned teams - FIXED: Changed from '/mentor/teams' to '/teams'
router.get('/teams', authenticateToken, requireRole(['mentor']), async (req, res) => {
    try {
        const teams = await getMentorTeams(req.user.userId);
        
        res.json({
            success: true,
            teams
        });

    } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch teams',
            error: error.message
        });
    }
});

// Get events for students (based on their team assignment)
router.get('/student/my-events', authenticateToken, requireRole(['student']), async (req, res) => {
    try {
        // Find teams where the student is a member
        const studentTeams = await Team.find({
            students: req.user.userId
        });

        if (studentTeams.length === 0) {
            return res.json({
                success: true,
                events: [],
                message: 'You are not assigned to any team yet.'
            });
        }

        const teamIds = studentTeams.map(team => team._id);

        // Find events assigned to these teams
        const events = await Event.find({
            assignedTeams: { $in: teamIds },
            isActive: true,
            eventDate: { $gte: new Date() } // Only upcoming events
        })
        .populate('mentor', 'name email')
        .populate('assignedTeams', 'name')
        .sort({ eventDate: 1 });

        res.json({
            success: true,
            events
        });

    } catch (error) {
        console.error('Error fetching student events:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch events',
            error: error.message
        });
    }
});

// Get single event by ID (Mentor only - own events) - MOVED TO END to avoid conflicts
router.get('/:eventId', authenticateToken, requireRole(['mentor']), async (req, res) => {
    try {
        const event = await Event.findOne({
            _id: req.params.eventId,
            mentor: req.user.userId,
            isActive: true
        })
        .populate('mentor', 'name email')
        .populate('assignedTeams', 'name students')
        .populate({
            path: 'assignedTeams',
            populate: {
                path: 'students',
                select: 'name email'
            }
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        res.json({
            success: true,
            event
        });

    } catch (error) {
        console.error('Error fetching event:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch event',
            error: error.message
        });
    }
});

// Update event (Mentor only - own events)
router.put('/:eventId', authenticateToken, requireRole(['mentor']), async (req, res) => {
    try {
        const {
            title,
            description,
            eventDate,
            eventTime,
            location,
            eventType,
            status,
            maxParticipants,
            requirements
        } = req.body;

        const event = await Event.findOne({
            _id: req.params.eventId,
            mentor: req.user.userId,
            isActive: true
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        // Update event fields
        if (title) event.title = title;
        if (description) event.description = description;
        if (eventDate) event.eventDate = new Date(eventDate);
        if (eventTime) event.eventTime = eventTime;
        if (location) event.location = location;
        if (eventType) event.eventType = eventType;
        if (status) event.status = status;
        if (maxParticipants !== undefined) event.maxParticipants = maxParticipants;
        if (requirements !== undefined) event.requirements = requirements;

        const updatedEvent = await event.save();
        
        const populatedEvent = await Event.findById(updatedEvent._id)
            .populate('mentor', 'name email')
            .populate('assignedTeams', 'name');

        res.json({
            success: true,
            message: 'Event updated successfully',
            event: populatedEvent
        });

    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update event',
            error: error.message
        });
    }
});

// Delete event (Mentor only - soft delete)
router.delete('/:eventId', authenticateToken, requireRole(['mentor']), async (req, res) => {
    try {
        const event = await Event.findOne({
            _id: req.params.eventId,
            mentor: req.user.userId,
            isActive: true
        });

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        // Soft delete
        event.isActive = false;
        await event.save();

        res.json({
            success: true,
            message: 'Event deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete event',
            error: error.message
        });
    }
});

module.exports = router;