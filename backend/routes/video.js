const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Video Resource Schema
const videoResourceSchema = new mongoose.Schema({
  folderTitle: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  folderThumbnail: {
    type: String,
    required: true
  },
  videos: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    link: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['video', 'playlist'],
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

const VideoResource = mongoose.model('VideoResource', videoResourceSchema);

// Create a new Video Resource Folder
router.post('/', async (req, res) => {
  try {
    const { folderTitle, folderThumbnail } = req.body;
    
    // Check if folder already exists
    const existingFolder = await VideoResource.findOne({ folderTitle });
    if (existingFolder) {
      return res.status(400).json({ message: 'Folder already exists' });
    }

    const newVideoResource = new VideoResource({
      folderTitle,
      folderThumbnail,
      videos: []
    });

    await newVideoResource.save();
    res.status(201).json(newVideoResource);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all Video Resource Folders
router.get('/', async (req, res) => {
  try {
    const videoResources = await VideoResource.find();
    res.json(videoResources);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get a specific Folder by ID
router.get('/:folderId', async (req, res) => {
  try {
    const folder = await VideoResource.findById(req.params.folderId);
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }
    res.json(folder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add Video to Folder
router.post('/:folderId/videos', async (req, res) => {
  try {
    const { title, description, link, type } = req.body;
    const folder = await VideoResource.findById(req.params.folderId);

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    const newVideo = {
      title,
      description,
      link,
      type
    };

    folder.videos.push(newVideo);
    await folder.save();

    // Return the newly added video with its generated _id
    const addedVideo = folder.videos[folder.videos.length - 1];
    res.status(201).json(addedVideo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a Folder
router.put('/:folderId', async (req, res) => {
    try {
      const { folderTitle, folderThumbnail } = req.body;
      
      // Find the folder by ID and update it
      const updatedFolder = await VideoResource.findByIdAndUpdate(
        req.params.folderId,
        { folderTitle, folderThumbnail },
        { new: true, runValidators: true } // Return the updated document and validate
      );
  
      if (!updatedFolder) {
        return res.status(404).json({ message: 'Folder not found' });
      }
  
      res.json(updatedFolder);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  
// Update a Video
router.put('/:folderId/videos/:videoId', async (req, res) => {
  try {
    const { title, description, link, type } = req.body;
    const folder = await VideoResource.findById(req.params.folderId);

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    const video = folder.videos.id(req.params.videoId);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    video.title = title;
    video.description = description;
    video.link = link;
    video.type = type;

    await folder.save();
    res.json(video);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a Video
router.delete('/:folderId/videos/:videoId', async (req, res) => {
  try {
    const folder = await VideoResource.findById(req.params.folderId);

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    folder.videos.pull(req.params.videoId);
    await folder.save();

    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a Folder
router.delete('/:folderId', async (req, res) => {
  try {
    await VideoResource.findByIdAndDelete(req.params.folderId);
    res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;