// routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

const { Folder, PDF } = require('../models/folder');

// Configure multer to store files in memory
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Create new folder
router.post('/folders', upload.single('image'), async (req, res) => {
  try {
    const { title, description } = req.body;

    const folder = new Folder({
      title,
      description,
      image: {
        data: req.file.buffer,
        contentType: req.file.mimetype
      }
    });

    await folder.save();
    res.status(201).json({
      _id: folder._id,
      title: folder.title,
      description: folder.description,
      createdAt: folder.createdAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all folders
router.get('/folders', async (req, res) => {
  try {
    const folders = await Folder.find().select('-image.data'); // Exclude image data from list
    res.json(folders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get folder image
// Get PDF file (updated for viewing)
router.get('/pdfs/:id', async (req, res) => {
    try {
      const pdf = await PDF.findById(req.params.id);
      if (!pdf || !pdf.pdf) {
        return res.status(404).json({ error: 'PDF not found' });
      }
      
      res.set('Content-Type', pdf.pdf.contentType);
      res.set('Content-Disposition', `inline; filename="${pdf.title}.pdf"`);
      res.send(pdf.pdf.data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  

// Upload PDF to a folder
router.post('/pdfs', upload.single('pdf'), async (req, res) => {
  try {
    const { title, folderId } = req.body;

    const pdf = new PDF({
      title,
      pdf: {
        data: req.file.buffer,
        contentType: req.file.mimetype
      },
      folderId
    });

    await pdf.save();
    res.status(201).json({
      _id: pdf._id,
      title: pdf.title,
      folderId: pdf.folderId,
      uploadDate: pdf.uploadDate
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get PDFs by folder
router.get('/folders/:folderId/pdfs', async (req, res) => {
  try {
    const pdfs = await PDF.find({ folderId: req.params.folderId })
      .select('-pdf.data'); // Exclude PDF data from list
    res.json(pdfs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get PDF file
router.get('/pdfs/:id', async (req, res) => {
  try {
    const pdf = await PDF.findById(req.params.id);
    if (!pdf || !pdf.pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }
    
    res.set('Content-Type', pdf.pdf.contentType);
    res.set('Content-Disposition', `inline; filename="${pdf.title}.pdf"`);
    res.send(pdf.pdf.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
