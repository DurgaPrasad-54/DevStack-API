// routes/adminApprovals.js
const express = require('express');
const router = express.Router();
const {
  ItemRequest,
  FolderRequest,
  PDFRequest,
  VideoFolderRequest,
  VideoRequest
} = require('../models/mentorresources');

// Import your existing models
const Item = require('../models/Item');
const { Folder, PDF } = require('../models/folder');

// IMPORTANT: You need to import VideoFolder from the correct location
// Replace this line with the correct import path for your VideoFolder model
// const VideoFolder = require('../models/VideoFolder'); // Adjust path as needed
// OR if VideoFolder is exported from folder.js, make sure it's properly exported

// ADMIN ROUTES - View and Approve/Reject Requests

// Get all pending requests for admin review
router.get('/pending', async (req, res) => {
  try {
    const { type } = req.query;
    
    let requests = [];
    
    if (!type || type === 'all') {
      // Get all types of pending requests
      const [items, folders, pdfs, videoFolders, videos] = await Promise.all([
        ItemRequest.find({ status: 'pending' }).populate('mentorId', 'name email').lean(),
        FolderRequest.find({ status: 'pending' }).populate('mentorId', 'name email').lean(),
        PDFRequest.find({ status: 'pending' }).populate('mentorId', 'name email').populate('folderId', 'title').lean(),
        VideoFolderRequest.find({ status: 'pending' }).populate('mentorId', 'name email').lean(),
        // FIXED: Don't populate VideoFolder reference if the model isn't properly imported
        // VideoRequest.find({ status: 'pending' }).populate('mentorId', 'name email').populate('folderId', 'folderTitle').lean()
        VideoRequest.find({ status: 'pending' }).populate('mentorId', 'name email').lean()
      ]);
      
      // Add requestType to each request based on the collection they came from
      const itemsWithType = items.map(item => ({ ...item, requestType: 'item' }));
      const foldersWithType = folders.map(folder => ({ ...folder, requestType: 'folder' }));
      const pdfsWithType = pdfs.map(pdf => ({ ...pdf, requestType: 'pdf' }));
      const videoFoldersWithType = videoFolders.map(vf => ({ ...vf, requestType: 'videoFolder' }));
      const videosWithType = videos.map(video => ({ ...video, requestType: 'video' }));
      
      requests = [...itemsWithType, ...foldersWithType, ...pdfsWithType, ...videoFoldersWithType, ...videosWithType];
    } else {
      // Get specific type of pending requests
      const models = {
        item: ItemRequest,
        folder: FolderRequest,
        pdf: PDFRequest,
        videoFolder: VideoFolderRequest,
        video: VideoRequest
      };
      
      if (models[type]) {
        let query = models[type].find({ status: 'pending' }).populate('mentorId', 'name email');
        
        // Add specific populate for models that need it
        if (type === 'pdf') {
          query = query.populate('folderId', 'title');
        } else if (type === 'video') {
          // FIXED: Comment out VideoFolder population until model is properly imported
          // query = query.populate('folderId', 'folderTitle');
        }
        
        const typeRequests = await query.lean();
        requests = typeRequests.map(req => ({ ...req, requestType: type }));
      }
    }
    
    // Sort by request date (newest first)
    requests.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));
    
    res.json(requests);
  } catch (error) {
    console.error('Error in /pending route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all requests (for admin dashboard)
router.get('/all', async (req, res) => {
  try {
    const { type, status } = req.query;
    
    let requests = [];
    
    if (!type || type === 'all') {
      // Get all types of requests
      const [items, folders, pdfs, videoFolders, videos] = await Promise.all([
        ItemRequest.find().populate('mentorId', 'name email').lean(),
        FolderRequest.find().populate('mentorId', 'name email').lean(),
        PDFRequest.find().populate('mentorId', 'name email').populate('folderId', 'title').lean(),
        VideoFolderRequest.find().populate('mentorId', 'name email').lean(),
        // FIXED: Don't populate VideoFolder reference
        VideoRequest.find().populate('mentorId', 'name email').lean()
      ]);
      
      // Add requestType to each request based on the collection they came from
      const itemsWithType = items.map(item => ({ ...item, requestType: 'item' }));
      const foldersWithType = folders.map(folder => ({ ...folder, requestType: 'folder' }));
      const pdfsWithType = pdfs.map(pdf => ({ ...pdf, requestType: 'pdf' }));
      const videoFoldersWithType = videoFolders.map(vf => ({ ...vf, requestType: 'videoFolder' }));
      const videosWithType = videos.map(video => ({ ...video, requestType: 'video' }));
      
      requests = [...itemsWithType, ...foldersWithType, ...pdfsWithType, ...videoFoldersWithType, ...videosWithType];
    } else {
      // Get specific type of requests
      const models = {
        item: ItemRequest,
        folder: FolderRequest,
        pdf: PDFRequest,
        videoFolder: VideoFolderRequest,
        video: VideoRequest
      };
      
      if (models[type]) {
        let query = models[type].find().populate('mentorId', 'name email');
        
        // Add specific populate for models that need it
        if (type === 'pdf') {
          query = query.populate('folderId', 'title');
        } else if (type === 'video') {
          // FIXED: Comment out VideoFolder population
          // query = query.populate('folderId', 'folderTitle');
        }
        
        const typeRequests = await query.lean();
        requests = typeRequests.map(req => ({ ...req, requestType: type }));
      }
    }
    
    // Filter by status if provided
    if (status && status !== 'all') {
      requests = requests.filter(request => request.status === status);
    }
    
    // Sort by request date (newest first)
    requests.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));
    
    res.json(requests);
  } catch (error) {
    console.error('Error in /all route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Approve a request (supports all resource types)
router.post('/approve/:requestType/:id', async (req, res) => {
  try {
    const { requestType, id } = req.params;
    const { adminNotes } = req.body;
    console.log('Approving request:', requestType, id, adminNotes);

    const models = {
      item: ItemRequest,
      folder: FolderRequest,
      pdf: PDFRequest,
      videoFolder: VideoFolderRequest,
      video: VideoRequest
    };

    const Model = models[requestType];
    if (!Model) {
      return res.status(400).json({ error: 'Invalid request type' });
    }

    const request = await Model.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    request.status = 'approved';
    request.approvalDate = new Date();
    if (adminNotes) {
      request.adminNotes = adminNotes;
    }
    await request.save();

    res.json({
      message: 'Request approved successfully',
      request
    });
  } catch (error) {
    console.error('Error in approve route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reject a request
router.post('/reject/:requestType/:id', async (req, res) => {
  try {
    const { requestType, id } = req.params;
    const { rejectionReason, adminNotes } = req.body;
    console.log('Rejecting request:', requestType, id, req.body);
    
    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }
    
    const models = {
      item: ItemRequest,
      folder: FolderRequest,
      pdf: PDFRequest,
      videoFolder: VideoFolderRequest,
      video: VideoRequest
    };
    
    const Model = models[requestType];
    if (!Model) {
      return res.status(400).json({ error: 'Invalid request type' });
    }
    
    const request = await Model.findById(id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }
    
    // Update request status
    request.status = 'rejected';
    request.rejectionReason = rejectionReason.trim();
    if (adminNotes) {
      request.adminNotes = adminNotes.trim();
    }
    await request.save();
    
    res.json({
      message: 'Request rejected successfully',
      request
    });
  } catch (error) {
    console.error('Error in reject route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get request details by ID
router.get('/:requestType/:id', async (req, res) => {
  try {
    const { requestType, id } = req.params;
    
    const models = {
      item: ItemRequest,
      folder: FolderRequest,
      pdf: PDFRequest,
      videoFolder: VideoFolderRequest,
      video: VideoRequest
    };
    
    const Model = models[requestType];
    if (!Model) {
      return res.status(400).json({ error: 'Invalid request type' });
    }
    
    let query = Model.findById(id).populate('mentorId', 'name email');
    
    // Add specific populate for models that need it
    if (requestType === 'pdf') {
      query = query.populate('folderId', 'title');
    } else if (requestType === 'video') {
      // FIXED: Comment out VideoFolder population
      // query = query.populate('folderId', 'folderTitle');
    }
    
    const request = await query.lean();
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    // Add requestType to the response
    request.requestType = requestType;
    
    res.json(request);
  } catch (error) {
    console.error('Error in get request details route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get folder image for folder requests
router.get('/folder-image/:id', async (req, res) => {
  try {
    const folderRequest = await FolderRequest.findById(req.params.id);
    if (!folderRequest || !folderRequest.image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    res.set('Content-Type', folderRequest.image.contentType);
    res.send(folderRequest.image.data);
  } catch (error) {
    console.error('Error in folder-image route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get PDF file for PDF requests
router.get('/pdf-file/:id', async (req, res) => {
  try {
    const pdfRequest = await PDFRequest.findById(req.params.id);
    if (!pdfRequest || !pdfRequest.pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }
    
    res.set('Content-Type', pdfRequest.pdf.contentType);
    res.set('Content-Disposition', `inline; filename="${pdfRequest.title || 'document'}.pdf"`);
    res.send(pdfRequest.pdf.data);
  } catch (error) {
    console.error('Error in pdf-file route:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;