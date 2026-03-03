const mongoose = require('mongoose');

const teamRequestSchema = new mongoose.Schema({
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
    ref: 'HackTeam', // use the registered model name
    required: true
  },
  hackathon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hackathon',
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

// Non-unique indexes for query optimization
teamRequestSchema.index({ sender: 1, status: 1 });
teamRequestSchema.index({ recipient: 1, status: 1 });
teamRequestSchema.index({ teamId: 1, status: 1 });
teamRequestSchema.index({ hackathon: 1 });

// Unique compound index to prevent exact duplicates (same sender inviting same recipient to same team)
teamRequestSchema.index({ sender: 1, recipient: 1, teamId: 1, status: 1 }, { unique: true });

const TeamRequest = mongoose.model('hackteamrequest', teamRequestSchema);

module.exports = TeamRequest;