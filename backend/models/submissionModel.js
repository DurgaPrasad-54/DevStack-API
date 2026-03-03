const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  githubLink: {
    type: String,
    required: true,
  },
  marks: {
    type: Number,
    default: null,
  },
  mentor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mentor',
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Submission = mongoose.model('Submission', submissionSchema);

module.exports = Submission;
