const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Project title is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Project description is required'],
    trim: true
  },
  thumbnail: {
    data: {
      type: Buffer,
      required: true
    },
    contentType: {
      type: String,
      required: true
    }
  },
  githubLink: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^https:\/\/github\.com\/.*/.test(v);
      },
      message: props => `${props.value} is not a valid GitHub URL!`
    }
  },
  youtubeLink: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^https:\/\/(www\.)?youtube\.com\/.*/.test(v) || /^https:\/\/youtu\.be\/.*/.test(v);
      },
      message: props => `${props.value} is not a valid YouTube URL!`
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Project', projectSchema);