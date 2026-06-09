const mongoose = require('mongoose');

// Team Request Schema
const teamRequestSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' }, // Reference to the team
    createdAt: { type: Date, default: Date.now }
});

const TeamRequest = mongoose.model('TeamRequest', teamRequestSchema);

module.exports = TeamRequest;