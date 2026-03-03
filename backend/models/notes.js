// models/noteModel.js
const mongoose = require('mongoose');

// Modified MongoDB Schema to store file buffer
const noteSchema = new mongoose.Schema({
  folderTitle: {
    type: String,
    required: true,
    trim: true
  },
  files: [{
    fileName: String,
    fileData: Buffer,
    uploadDate: {
      type: Date,
      default: Date.now
    }
  }]
});

const Note = mongoose.model('Note', noteSchema);
module.exports = Note;
