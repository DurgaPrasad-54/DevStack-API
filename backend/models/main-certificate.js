const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  programName: {
    type: String,
    required: true
  },
  currentYear: {
    type: String,
    required: true,
    enum: ['first year', 'second year', 'third year', 'fourth year', 'alumni']
  },
  totalMarks: {
    type: Number,
    required: true
  },
  grade: {
    type: String,
    required: true
  },
  certificateType: {
    type: String,
    enum: ['participation', 'completion'],
    required: true
  },
  certificateId: {
    type: String,
    required: true,
    unique: true
  },
  issueDate: {
    type: Date,
    default: Date.now
  },
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  }
});

const Certificate = mongoose.model('Certificate', certificateSchema);

module.exports = Certificate;