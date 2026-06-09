const express = require('express');
const router = express.Router();
const multer = require('multer');
const Project = require('../models/projects');

// Configure multer for memory storage
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
    cb(new Error('Only image files (jpeg, jpg, png, webp) are allowed!'));
  }
});

// Create new project
router.post('/', upload.single('thumbnail'), async (req, res) => {
  try {
    const { title, description, githubLink, youtubeLink } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Thumbnail is required' });
    }

    const project = new Project({
      title,
      description,
      thumbnail: {
        data: req.file.buffer,
        contentType: req.file.mimetype
      },
      githubLink,
      youtubeLink
    });

    await project.save();
    res.status(201).json({
      _id: project._id,
      title: project.title,
      description: project.description,
      githubLink: project.githubLink,
      youtubeLink: project.youtubeLink,
      createdAt: project.createdAt
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all projects
router.get('/', async (req, res) => {
  try {
    const projects = await Project.find()
      .select('-thumbnail.data')
      .sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get project thumbnail
router.get('/:id/thumbnail', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).select('thumbnail');
    if (!project || !project.thumbnail) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }
    
    res.set('Content-Type', project.thumbnail.contentType);
    res.send(project.thumbnail.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update project
router.put('/:id', upload.single('thumbnail'), async (req, res) => {
  try {
    const updates = req.body;
    
    if (req.file) {
      updates.thumbnail = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    const project = await Project.findByIdAndUpdate(
      req.params.id, 
      updates,
      { new: true, runValidators: true }
    ).select('-thumbnail.data');

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;