const mongoose = require('mongoose');

const HackNotificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Add target audience to control who sees what notifications
  targetAudience: {
    type: String,
    enum: ['all', 'students', 'mentors','coordinators' ,'admins'],
    default: 'all'
  }
});

module.exports = mongoose.model('HackNotification', HackNotificationSchema);