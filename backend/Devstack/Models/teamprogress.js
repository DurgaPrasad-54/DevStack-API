const mongoose = require('mongoose');

const teamProgressSchema = new mongoose.Schema({
  hackathonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HackathonAdmin',
    required: true
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HackTeam',
    required: true
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    default: 0
  },
  status: {
    type: String,
    enum: ['Not Started', 'In Progress', 'Completed'],
    default: 'Not Started'
  },
  description: {
    type: String,
    default: '',
    maxlength: 1000
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    default: null
  }
}, { 
  timestamps: true 
});

// Compound index for efficient queries
teamProgressSchema.index({ hackathonId: 1, teamId: 1 }, { unique: true });

// Pre-save hook to update status based on percentage
teamProgressSchema.pre('save', function(next) {
  if (this.percentage === 0) {
    this.status = 'Not Started';
  } else if (this.percentage === 100) {
    this.status = 'Completed';
  } else {
    this.status = 'In Progress';
  }
  next();
});

// Pre-update hook for findOneAndUpdate
teamProgressSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  const percentage = update.percentage || update.$set?.percentage;
  
  if (percentage !== undefined) {
    if (percentage === 0) {
      if (update.$set) {
        update.$set.status = 'Not Started';
      } else {
        update.status = 'Not Started';
      }
    } else if (percentage === 100) {
      if (update.$set) {
        update.$set.status = 'Completed';
      } else {
        update.status = 'Completed';
      }
    } else {
      if (update.$set) {
        update.$set.status = 'In Progress';
      } else {
        update.status = 'In Progress';
      }
    }
  }
  
  next();
});

module.exports = mongoose.model('TeamProgress', teamProgressSchema);