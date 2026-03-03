// models.js
const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  image: {
    data: Buffer,
    contentType: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const pdfSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  pdf: {
    data: Buffer,
    contentType: String
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    required: true
  },
  uploadDate: {
    type: Date,
    default: Date.now
  }
});

const Folder = mongoose.model('Folder', folderSchema);
const PDF = mongoose.model('PDF', pdfSchema);

module.exports = { Folder, PDF };