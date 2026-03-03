// Models/hackathonattendance.js
const mongoose = require("mongoose");

// Sub-schema for individual student attendance within a session
const studentAttendanceSchema = new mongoose.Schema(
  {
    registrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackRegister",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    status: {
      type: String,
      enum: ["present", "absent", "late", "excused"],
      default: "absent",
    },
    checkInTime: {
      type: Date,
      default: null,
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

// Sub-schema for each session (e.g., Day 1, Day 2, etc.)
const sessionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    students: [studentAttendanceSchema],
  },
  { _id: false }
);

// Main Hackathon Attendance Schema
const hackathonAttendanceSchema = new mongoose.Schema(
  {
    hackathon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
      index: true,
    },
    branch: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    year: {
      type: String,
      trim: true,
    },
    sessions: [sessionSchema],
  },
  { timestamps: true }
);

// Compound unique index: ONE document per hackathon+branch combination
hackathonAttendanceSchema.index(
  { hackathon: 1, branch: 1 },
  { unique: true }
);

// Nested compound unique index to prevent duplicate attendance for same student in same session
hackathonAttendanceSchema.index(
  { hackathon: 1, "sessions.name": 1, "sessions.students.student": 1 },
  { unique: true, sparse: true }
);

// Auto-populate Hackathon details
hackathonAttendanceSchema.pre(/^find/, function (next) {
  if (!this.getOptions().skipPopulate) {
    this.populate({
      path: "hackathon",
      select: "hackathonname college year technology startdate enddate venue",
    });
  }
  next();
});

// Prevent duplicate session names in one document
hackathonAttendanceSchema.pre('save', function(next) {
  if (this.sessions && this.sessions.length > 0) {
    const sessionNames = this.sessions.map(s => s.name.toLowerCase().trim());
    const duplicates = sessionNames.filter((name, index) => sessionNames.indexOf(name) !== index);
    
    if (duplicates.length > 0) {
      const err = new Error(`Duplicate session names found: ${duplicates.join(', ')}`);
      err.statusCode = 400;
      return next(err);
    }
  }
  next();
});

// Prevent duplicate students within the same session on save
hackathonAttendanceSchema.pre('save', function(next) {
  if (this.sessions && this.sessions.length > 0) {
    for (const session of this.sessions) {
      if (session.students && session.students.length > 0) {
        const studentIds = session.students.map(s => s.student.toString());
        const duplicates = studentIds.filter((id, index) => studentIds.indexOf(id) !== index);
        if (duplicates.length > 0) {
          const err = new Error(`Duplicate students in session "${session.name}": ${duplicates.join(', ')}`);
          err.statusCode = 400;
          return next(err);
        }
      }
    }
  }
  next();
});

// Prevent duplicate students within the same session on update
hackathonAttendanceSchema.pre('findOneAndUpdate', async function(next) {
  const update = this.getUpdate();
  const docToUpdate = await this.model.findOne(this.getQuery());
  if (!docToUpdate) return next();

  const newSessions = update.$set?.sessions || update.sessions;
  if (!newSessions || newSessions.length === 0) return next();

  for (const session of newSessions) {
    if (session.students && session.students.length > 0) {
      const studentIds = session.students.map(s => s.student.toString());
      const duplicates = studentIds.filter((id, index) => studentIds.indexOf(id) !== index);
      if (duplicates.length > 0) {
        const err = new Error(`Duplicate students in session "${session.name}": ${duplicates.join(', ')}`);
        err.statusCode = 400;
        return next(err);
      }
    }
  }

  next();
});

const HackathonAttendance = mongoose.model(
  "HackathonAttendance",
  hackathonAttendanceSchema
);

module.exports = HackathonAttendance;
