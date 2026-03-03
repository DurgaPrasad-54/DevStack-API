// routes/noteRoutes.js
const express = require('express');
const multer = require('multer');
const Note = require('../models/notes');

const router = express.Router();

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Create new folder
router.post('/', async (req, res) => {
  try {
    const { folderTitle } = req.body;
    const existingFolder = await Note.findOne({ folderTitle });

    if (existingFolder) {
      return res.status(400).json({ message: 'Folder already exists' });
    }

    const newFolder = new Note({ folderTitle, files: [] });
    await newFolder.save();

    res.status(201).json(newFolder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all folders with files
router.get('/', async (req, res) => {
  try {
    const folders = await Note.find().select('-files.fileData'); // Exclude file data from list
    res.json(folders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get specific file
router.get('/files/:folderId/:fileId', async (req, res) => {
  try {
    const folder = await Note.findById(req.params.folderId);
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    const file = folder.files.id(req.params.fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${file.fileName}"`,
    });
    res.send(file.fileData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Fetch all PDFs in a folder (file metadata)
router.get('/:folderId/files', async (req, res) => {
  try {
    const folder = await Note.findById(req.params.folderId);

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    // Return only the metadata (without file content)
    const filesMetadata = folder.files.map(file => ({
      fileName: file.fileName,
      uploadDate: file.uploadDate
    }));

    res.json(filesMetadata);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Upload multiple PDFs to folder
router.post('/:folderId/upload', upload.array('files', 10), async (req, res) => {
  try {
    const folder = await Note.findById(req.params.folderId);

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    const fileInfos = req.files.map(file => ({
      fileName: file.originalname,
      fileData: file.buffer
    }));

    folder.files.push(...fileInfos);
    await folder.save();

    const response = await Note.findById(req.params.folderId).select('-files.fileData');
    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete file from folder
router.delete('/:folderId/files/:fileId', async (req, res) => {
  try {
    const folder = await Note.findById(req.params.folderId);

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    const file = folder.files.id(req.params.fileId);
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    folder.files.pull(req.params.fileId);
    await folder.save();

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete folder
router.delete('/:folderId', async (req, res) => {
  try {
    const folder = await Note.findById(req.params.folderId);

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    await Note.findByIdAndDelete(req.params.folderId);

    res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
