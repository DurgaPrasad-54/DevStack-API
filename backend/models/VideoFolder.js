const mongoose = require('mongoose');

const videoFolderSchema = new mongoose.Schema({
  folderTitle: {
    type: String,
    required: true,
    trim: true
  },
  folderThumbnail: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mentor',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const VideoFolder = mongoose.model('VideoFolder', videoFolderSchema);

module.exports = { VideoFolder };
