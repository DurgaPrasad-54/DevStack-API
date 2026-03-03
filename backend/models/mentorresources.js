// models/MentorRequest.js
const mongoose = require('mongoose');

// Base fields for all request types
const baseFields = {
  mentorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mentor',
    required: true
  },
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
  adminNotes: {
    type: String
  },
  // Additional metadata for better tracking
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
};

// Item Request Schema
const itemRequestSchema = new mongoose.Schema({
  ...baseFields,
  title: { 
    type: String, 
    required: true,
    trim: true
  },
  hyperlink: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { 
    type: String, 
    required: true,
    trim: true
  },
  requestType: {
    type: String,
    default: 'item',
    enum: ['item']
  }
});

// Folder Request Schema
const folderRequestSchema = new mongoose.Schema({
  ...baseFields,
  folderTitle: { 
    type: String, 
    required: true,
    trim: true
  },
  requestType: {
    type: String,
    default: 'folder',
    enum: ['folder']
  }
});

// Enhanced PDF Request Schema with file metadata
const pdfRequestSchema = new mongoose.Schema({
  ...baseFields,
  title: { 
    type: String,
    trim: true
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    required: true
  },
  // Store PDF file in MongoDB
  pdf: {
    data: {
      type: Buffer,
      required: true
    },
    contentType: {
      type: String,
      required: true,
      default: 'application/pdf'
    },
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    uploadDate: {
      type: Date,
      default: Date.now
    }
  },
  // Additional metadata
  fileMetadata: {
    pages: Number,
    encrypted: { type: Boolean, default: false },
    version: String
  },
  requestType: {
    type: String,
    default: 'pdf',
    enum: ['pdf']
  }
});

// Video Folder Request Schema  
const videoFolderRequestSchema = new mongoose.Schema({
  ...baseFields,
  folderTitle: { 
    type: String, 
    required: true,
    trim: true
  },
  folderThumbnail: { 
    type: String, 
    required: true,
    trim: true
  },
  requestType: {
    type: String,
    default: 'videoFolder',
    enum: ['videoFolder']
  }
});

// Enhanced Video Request Schema with file storage support
const videoRequestSchema = new mongoose.Schema({
  ...baseFields,
  title: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { 
    type: String, 
    required: true,
    trim: true
  },
  // Support both URL links and file uploads
  link: { 
    type: String,
    trim: true
  },
  // Store video file in MongoDB (for uploaded videos)
  videoFile: {
    data: Buffer,
    contentType: String,
    filename: String,
    originalName: String,
    size: Number,
    uploadDate: {
      type: Date,
      default: Date.now
    }
  },
  // Video metadata
  videoMetadata: {
    duration: Number, // in seconds
    resolution: String, // e.g., "1920x1080"
    bitrate: Number,
    codec: String,
    fps: Number
  },
  type: {
    type: String,
    enum: ['lecture', 'tutorial', 'workshop', 'demo'],
    required: true
  },
  // Source type: 'url' for links, 'upload' for file uploads
  sourceType: {
    type: String,
    enum: ['url', 'upload'],
    default: 'url'
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VideoFolder',
    required: true
  },
  // Thumbnail for uploaded videos
  thumbnail: {
    data: Buffer,
    contentType: String,
    filename: String
  },
  requestType: {
    type: String,
    default: 'video',
    enum: ['video']
  }
});

// Add pre-save middleware to update timestamps
const updateTimestamp = function(next) {
  this.updatedAt = Date.now();
  next();
};

itemRequestSchema.pre('save', updateTimestamp);
folderRequestSchema.pre('save', updateTimestamp);
pdfRequestSchema.pre('save', updateTimestamp);
videoFolderRequestSchema.pre('save', updateTimestamp);
videoRequestSchema.pre('save', updateTimestamp);

// Add indexes for better performance
itemRequestSchema.index({ mentorId: 1, status: 1, requestDate: -1 });
folderRequestSchema.index({ mentorId: 1, status: 1, requestDate: -1 });
pdfRequestSchema.index({ mentorId: 1, folderId: 1, status: 1, requestDate: -1 });
videoFolderRequestSchema.index({ mentorId: 1, status: 1, requestDate: -1 });
videoRequestSchema.index({ mentorId: 1, folderId: 1, status: 1, requestDate: -1 });

// Create models
const ItemRequest = mongoose.model('ItemRequest', itemRequestSchema);
const FolderRequest = mongoose.model('FolderRequest', folderRequestSchema);
const PDFRequest = mongoose.model('PDFRequest', pdfRequestSchema);
const VideoFolderRequest = mongoose.model('VideoFolderRequest', videoFolderRequestSchema);
const VideoRequest = mongoose.model('VideoRequest', videoRequestSchema);

module.exports = {
  ItemRequest,
  FolderRequest,
  PDFRequest,
  VideoFolderRequest,
  VideoRequest
};