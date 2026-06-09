const mongoose = require('mongoose');
const teamjoinRequestSchema = new mongoose.Schema({
    sender: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Student',
        required: true
    },
    recipient: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Student',
        required: true
    },
    teamId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Team',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Add index for faster queries
teamjoinRequestSchema.index({ sender: 1, teamId: 1, status: 1, type: 1 });
teamjoinRequestSchema.index({ recipient: 1, status: 1 });

const TeamjoinRequest = mongoose.model('TeamjoinRequest', teamjoinRequestSchema);

module.exports = TeamjoinRequest;