const mongoose = require('mongoose');

// HackTeam Schema - Add selectedProblemStatementSubId
const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    hackathon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hackathon',
      required: true,
    },
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HackRegister',
      }
    ],
    teamLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HackRegister',
    },
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mentor',
      default: null,
    },
    // Parent ProblemStatement document
    selectedProblemStatement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProblemStatement',
      default: null,
    },
    // Sub-problem statement ID within the problemStatements array
    selectedProblemStatementSubId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound unique index: team name must be unique per hackathon
teamSchema.index({ name: 1, hackathon: 1 }, { unique: true });

// Validate students aren't in multiple teams (works on save)
teamSchema.pre('save', async function (next) {
  const HackTeam = mongoose.model('HackTeam');

  if (this.students && this.students.length > 0) {
    const conflict = await HackTeam.findOne({
      hackathon: this.hackathon,
      _id: { $ne: this._id },
      students: { $in: this.students },
    });

    if (conflict) {
      const err = new Error('One or more students are already in another team for this hackathon');
      err.statusCode = 400;
      return next(err);
    }
  }
  next();
});

// Validate students aren't in multiple teams on updates (findOneAndUpdate, updateOne, etc.)
teamSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate();
  const HackTeam = mongoose.model('HackTeam');

  // Get the document being updated
  const docToUpdate = await this.model.findOne(this.getQuery());
  if (!docToUpdate) return next();

  // Check if students array is being modified through $set or direct update
  const newStudents = update.$set?.students || update.students;
  if (!newStudents || newStudents.length === 0) return next();

  const conflict = await HackTeam.findOne({
    hackathon: docToUpdate.hackathon,
    _id: { $ne: docToUpdate._id },
    students: { $in: newStudents },
  });

  if (conflict) {
    const err = new Error('One or more students are already in another team for this hackathon');
    err.statusCode = 400;
    return next(err);
  }

  next();
});

module.exports = mongoose.models.HackTeam || mongoose.model('HackTeam', teamSchema);
