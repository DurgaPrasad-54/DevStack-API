const mongoose = require('mongoose');

// Student Schema
const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  rollNo: { type: String, required: true, unique: true },
  branch: { type: String, required: true },
  year: { type: String, required: true },
  currentYear: { 
    type: String, 
    required: true,
    enum: ['first year', 'second year', 'third year', 'fourth year', 'alumni'],
    default: 'first year'
  },
  college: { type: String, required: true },
  github: { type: String },
  linkedin: { type: String },
  otp: { type: String, default: null },
  otpExpiry: { type: Date, default: null }
});

// Mentor Schema
const mentorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true },
  password: { type: String, required: true },
  github: { type: String, required: true },
  linkedin: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  requestDate: { 
    type: Date, 
    default: Date.now 
  },
  approvalDate: { 
    type: Date 
  },
  rejectionReason: { 
    type: String 
  },
  otp: { type: String, default: null },
  otpExpiry: { type: Date, default: null }
});

// Admin Schema with OTP fields
const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true },
  password: { type: String, required: true },
  otp: { type: String, default: null },
  otpExpiry: { type: Date, default: null }
});

// Export Models
const Student = mongoose.model('Student', studentSchema);
const Mentor = mongoose.model('Mentor', mentorSchema);
const Admin = mongoose.model('Admin', adminSchema);

module.exports = {
  Student,
  Mentor,
  Admin
};