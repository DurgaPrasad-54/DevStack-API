const mongoose = require('mongoose');

const  mentoreventSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true,
        trim: true
    },
    description: { 
        type: String, 
        required: true 
    },
    eventDate: { 
        type: Date, 
        required: true 
    },
    eventTime: { 
        type: String, 
        required: true 
    },
    location: { 
        type: String, 
        required: true 
    },
    mentor: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Mentor',
        required: true 
    },
    assignedTeams: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Team' 
    }],
    eventType: {
        type: String,
        enum: ['workshop', 'meeting', 'seminar', 'competition', 'other'],
        default: 'meeting'
    },
    status: {
        type: String,
        enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
        default: 'upcoming'
    },
    maxParticipants: {
        type: Number,
        default: null
    },
    requirements: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { 
    timestamps: true 
});

// Index for better query performance
mentoreventSchema.index({ mentor: 1, eventDate: 1 });
mentoreventSchema.index({ assignedTeams: 1 });

// Prevent OverwriteModelError
module.exports = mongoose.models.MentorEvent || mongoose.model('MentorEvent', mentoreventSchema);