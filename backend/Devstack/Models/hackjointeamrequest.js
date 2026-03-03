const mongoose = require('mongoose');
const teamJoinRequestSchema = new mongoose.Schema({
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
    ref: 'HackTeam', // match the registered model name
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

// // Indexes for optimization
// teamJoinRequestSchema.index({ sender: 1, status: 1 });
// teamJoinRequestSchema.index({ recipient: 1, status: 1 });
// teamJoinRequestSchema.index({ teamId: 1, status: 1 });
// teamJoinRequestSchema.index({ hackathon: 1 });



const TeamJoinRequest = mongoose.models.TeamJoinRequest || 
  mongoose.model('hackjointeamrequest', teamJoinRequestSchema);

module.exports = TeamJoinRequest;