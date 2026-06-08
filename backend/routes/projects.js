const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const Project = require('../models/projects');
const { authenticateToken } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errorHandler');

// Configure multer for memory storage with validation
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files (jpeg, jpg, png, webp) are allowed'));
  }
});

// Create new project - OPTIMIZED
router.post('/', authenticateToken, upload.single('thumbnail'), asyncHandler(async (req, res) => {
  const { title, description, githubLink, youtubeLink, teamId } = req.body;

  if (!title) {
    return res.status(400).json({
      success: false,
      message: 'Title is required'
    });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Thumbnail is required'
    });
  }

  const project = new Project({
    title,
    description,
    thumbnail: {
      data: req.file.buffer,
      contentType: req.file.mimetype
    },
    githubLink,
    youtubeLink,
    teamId,
    createdBy: req.user.userId,
  });

  await project.save();

  res.status(201).json({
    success: true,
    message: 'Project created successfully',
    data: {
      _id: project._id,
      title: project.title,
      description: project.description,
      githubLink: project.githubLink,
      youtubeLink: project.youtubeLink,
      createdAt: project.createdAt,
    }
  });
}));

// Get all projects - OPTIMIZED
router.get('/', asyncHandler(async (req, res) => {
  const { teamId, page = 1, limit = 20 } = req.query;

  const query = {};
  if (teamId && mongoose.Types.ObjectId.isValid(teamId)) {
    query.teamId = teamId;
  }

  const skip = (page - 1) * limit;

  const [projects, total] = await Promise.all([
    Project.find(query)
      .select('-thumbnail.data')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Project.countDocuments(query)
  ]);

  res.json({
    success: true,
    data: projects,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit)
    }
  });
}));

// Get project by ID - OPTIMIZED
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid project ID'
    });
  }

  const project = await Project.findById(id)
    .select('-thumbnail.data')
    .lean();

  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found'
    });
  }

  res.json({
    success: true,
    data: project
  });
}));

// Get project thumbnail - OPTIMIZED
router.get('/:id/thumbnail', asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid project ID'
    });
  }

  const project = await Project.findById(id)
    .select('thumbnail')
    .lean();

  if (!project || !project.thumbnail) {
    return res.status(404).json({
      success: false,
      message: 'Thumbnail not found'
    });
  }

  res.set('Content-Type', project.thumbnail.contentType);
  res.set('Cache-Control', 'public, max-age=604800'); // Cache for 1 week
  res.send(project.thumbnail.data);
}));

// Update project - OPTIMIZED
router.put('/:id', authenticateToken, upload.single('thumbnail'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, githubLink, youtubeLink } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid project ID'
    });
  }

  const project = await Project.findById(id);
  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found'
    });
  }

  // Update fields
  if (title) project.title = title;
  if (description) project.description = description;
  if (githubLink) project.githubLink = githubLink;
  if (youtubeLink) project.youtubeLink = youtubeLink;

  if (req.file) {
    project.thumbnail = {
      data: req.file.buffer,
      contentType: req.file.mimetype
    };
  }

  project.updatedAt = new Date();
  await project.save();

  const response = project.toObject();
  delete response.thumbnail.data;

  res.json({
    success: true,
    message: 'Project updated successfully',
    data: response
  });
}));

// Delete project - OPTIMIZED
router.delete('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid project ID'
    });
  }

  const project = await Project.findByIdAndDelete(id);
  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Project not found'
    });
  }

  res.json({
    success: true,
    message: 'Project deleted successfully'
  });
}));

module.exports = router;