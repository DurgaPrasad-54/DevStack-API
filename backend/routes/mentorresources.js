// routes/mentorResources.js - Enhanced with file storage
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

// Import models with error handling
let ItemRequest, FolderRequest, PDFRequest, VideoFolderRequest, VideoRequest;
let Folder, VideoFolder;

try {
  const mentorModels = require('../models/mentorresources');
  ItemRequest = mentorModels.ItemRequest;
  FolderRequest = mentorModels.FolderRequest;
  PDFRequest = mentorModels.PDFRequest;
  VideoFolderRequest = mentorModels.VideoFolderRequest;
  VideoRequest = mentorModels.VideoRequest;
  console.log('✅ Mentor resource models loaded successfully');
} catch (error) {
  console.error('❌ Error loading mentor resource models:', error);
}

try {
  const folderModels = require('../models/folder');
  Folder = folderModels.Folder || folderModels.default;
  console.log('✅ Folder model loaded successfully');
} catch (error) {
  console.error('❌ Error loading folder model:', error);
  Folder = { findOne: async () => null, find: async () => [] };
}

try {
  const videoFolderModels = require('../models/VideoFolder');
  VideoFolder = videoFolderModels.VideoFolder || videoFolderModels.default;
  console.log('✅ VideoFolder model loaded successfully');
} catch (error) {
  console.error('❌ Error loading VideoFolder model:', error);
  VideoFolder = { findOne: async () => null, find: async () => [] };
}

// Enhanced multer configuration for multiple file types
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    const { requestType } = req.body;
    
    if (requestType === 'pdf') {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed for PDF requests'), false);
      }
    } else if (requestType === 'video') {
      // Allow video files
      if (file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only video files are allowed for video requests'), false);
      }
    } else {
      cb(null, true);
    }
  }
});

// GET MENTOR'S REQUESTS WITH FILE METADATA
router.get('/my-requests/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    
    console.log('📋 Fetching requests for mentor:', mentorId);
    
    if (!mentorId || !/^[0-9a-fA-F]{24}$/.test(mentorId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid mentor ID is required' 
      });
    }

    if (!ItemRequest || !FolderRequest || !PDFRequest || !VideoFolderRequest || !VideoRequest) {
      return res.status(500).json({ 
        success: false, 
        error: 'Database models not available' 
      });
    }

    // Fetch all request types with file metadata
    const results = await Promise.allSettled([
      ItemRequest.find({ mentorId }).sort({ requestDate: -1 }).lean(),
      FolderRequest.find({ mentorId }).sort({ requestDate: -1 }).lean(),
      PDFRequest.find({ mentorId })
        .populate('folderId', 'title')
        .select('-pdf.data') // Exclude file data for list view
        .sort({ requestDate: -1 })
        .lean(),
      VideoFolderRequest.find({ mentorId }).sort({ requestDate: -1 }).lean(),
      VideoRequest.find({ mentorId })
        .populate('folderId', 'folderTitle')
        .select('-videoFile.data -thumbnail.data') // Exclude file data for list view
        .sort({ requestDate: -1 })
        .lean()
    ]);
 console.log('✅ Fetched all result types',results);
    const [itemsResult, foldersResult, pdfsResult, videoFoldersResult, videosResult] = results;
    
    const items = itemsResult.status === 'fulfilled' ? itemsResult.value : [];
    const folders = foldersResult.status === 'fulfilled' ? foldersResult.value : [];
    const pdfs = pdfsResult.status === 'fulfilled' ? pdfsResult.value : [];
    const videoFolders = videoFoldersResult.status === 'fulfilled' ? videoFoldersResult.value : [];
    const videos = videosResult.status === 'fulfilled' ? videosResult.value : [];
    console.log('🎬 Video requests found:', videoFolders,videos);

    // Add file metadata and request type
    const allRequests = [
      ...items.map(item => ({ ...item, requestType: 'item' })),
      ...folders.map(folder => ({ ...folder, requestType: 'folder' })),
      ...pdfs.map(pdf => ({ 
        ...pdf, 
        requestType: 'pdf',
        hasFile: !!pdf.pdf,
        fileInfo: pdf.pdf ? {
          filename: pdf.pdf.filename,
          originalName: pdf.pdf.originalName,
          size: pdf.pdf.size,
          uploadDate: pdf.pdf.uploadDate
        } : null
      })),
      ...videoFolders.map(vf => ({ ...vf, requestType: 'videoFolder' })),
      ...videos.map(video => ({ 
        ...video, 
        requestType: 'video',
        hasFile: !!video.videoFile,
        fileInfo: video.videoFile ? {
          filename: video.videoFile.filename,
          originalName: video.videoFile.originalName,
          size: video.videoFile.size,
          uploadDate: video.videoFile.uploadDate
        } : null,
        hasThumbnail: !!video.thumbnail
      }))
    ];

    allRequests.sort((a, b) => new Date(b.requestDate) - new Date(a.requestDate));

    console.log('✅ Successfully fetched', allRequests.length, 'total requests');
    
    res.json({
      success: true,
      requests: allRequests,
      counts: {
        items: items.length,
        folders: folders.length,
        pdfs: pdfs.length,
        videoFolders: videoFolders.length,
        videos: videos.length,
        total: allRequests.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching mentor requests:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// CREATE NEW REQUEST WITH FILE UPLOAD
// CREATE NEW REQUEST WITH FILE UPLOAD
router.post('/request', upload.single('file'), async (req, res) => {
 try {
   console.log('📝 Creating new request...');
   console.log('Request body:', req.body);
   console.log('Request file:', req.file ? { name: req.file.originalname, size: req.file.size, type: req.file.mimetype } : null);
   
   const { requestType, mentorId } = req.body;
   
   if (!requestType || !mentorId) {
     return res.status(400).json({ 
       success: false, 
       message: 'Request type and mentor ID are required' 
     });
   }

   if (!/^[0-9a-fA-F]{24}$/.test(mentorId)) {
     return res.status(400).json({ 
       success: false, 
       message: 'Invalid mentor ID format' 
     });
   }

   if (!ItemRequest || !FolderRequest || !PDFRequest || !VideoFolderRequest || !VideoRequest) {
     return res.status(500).json({ 
       success: false, 
       message: 'Database models not available' 
     });
   }

   let newRequest;

   switch (requestType) {
     case 'item':
       const { title, hyperlink, description } = req.body;
       if (!title || !hyperlink || !description) {
         return res.status(400).json({ 
           success: false, 
           message: 'Title, hyperlink, and description are required for item requests' 
         });
       }
       
       newRequest = new ItemRequest({
         mentorId,
         title,
         hyperlink,
         description,
         status: 'pending',
         requestDate: new Date()
       });
       break;

     case 'folder':
       const { folderTitle } = req.body;
       if (!folderTitle) {
         return res.status(400).json({ 
           success: false, 
           message: 'Folder title is required for folder requests' 
         });
       }
       
       newRequest = new FolderRequest({
         mentorId,
         folderTitle,
         status: 'pending',
         requestDate: new Date()
       });
       break;

     case 'pdf':
       const { title: pdfTitle, folderId } = req.body;
       if (!folderId || !req.file) {
         return res.status(400).json({ 
           success: false, 
           message: 'Folder ID and PDF file are required for PDF requests' 
         });
       }
       
       // Validate folder exists and is accessible
       let validFolder = null;
       try {
         const approvedFolderRequest = await FolderRequest.findOne({
           _id: folderId,
           mentorId: mentorId,
           status: 'approved'
         });
         validFolder = approvedFolderRequest;
       } catch (error) {
         console.log('Error checking folder request:', error.message);
       }
       
       if (!validFolder && Folder.findOne) {
         try {
           const existingFolder = await Folder.findOne({
             _id: folderId,
             createdBy: mentorId
           });
           validFolder = existingFolder;
         } catch (error) {
           console.log('Error checking existing folder:', error.message);
         }
       }
       
       if (!validFolder) {
         return res.status(400).json({ 
           success: false, 
           message: 'Selected folder does not exist or is not approved' 
         });
       }
       
       newRequest = new PDFRequest({
         mentorId,
         title: pdfTitle || req.file.originalname.replace('.pdf', ''),
         folderId,
         pdf: {
           data: req.file.buffer,
           contentType: req.file.mimetype,
           filename: `${Date.now()}_${req.file.originalname}`,
           originalName: req.file.originalname,
           size: req.file.size,
           uploadDate: new Date()
         },
         status: 'pending',
         requestDate: new Date()
       });
       break;

     case 'videoFolder':
       const { folderTitle: videoFolderTitle, folderThumbnail } = req.body;
       if (!videoFolderTitle || !folderThumbnail) {
         return res.status(400).json({ 
           success: false, 
           message: 'Folder title and thumbnail URL are required for video folder requests' 
         });
       }
       
       newRequest = new VideoFolderRequest({
         mentorId,
         folderTitle: videoFolderTitle,
         folderThumbnail,
         status: 'pending',
         requestDate: new Date()
       });
       break;

     case 'video':
       const { 
         title: videoTitle, 
         description: videoDescription, 
         link, 
         type, 
         folderId: videoFolderId,
         sourceType = 'url'
       } = req.body;
       
       if (!videoTitle || !videoDescription || !type || !videoFolderId) {
         return res.status(400).json({ 
           success: false, 
           message: 'Title, description, type, and folder are required for video requests' 
         });
       }

       // For URL videos, link is required. For uploads, file is required.
       if (sourceType === 'url' && !link) {
         return res.status(400).json({ 
           success: false, 
           message: 'Video link is required for URL-based video requests' 
         });
       }

       if (sourceType === 'upload' && !req.file) {
         return res.status(400).json({ 
           success: false, 
           message: 'Video file is required for upload-based video requests' 
         });
       }
       
       // Validate video folder
       let validVideoFolder = null;
       try {
         const approvedVideoFolderRequest = await VideoFolderRequest.findOne({
           _id: videoFolderId,
           mentorId: mentorId,
           status: 'approved'
         });
         if (approvedVideoFolderRequest) {
           validVideoFolder = approvedVideoFolderRequest;
           console.log('✅ Found approved VideoFolderRequest:', approvedVideoFolderRequest._id);
         }
       } catch (error) {
         console.log('Error checking video folder request:', error.message);
       }
       
       if (!validVideoFolder && VideoFolder.findOne) {
         try {
           // Check for existing video folders created by this mentor
           const existingVideoFolder = await VideoFolder.findOne({
             _id: videoFolderId,
             createdBy: mentorId
           });
           if (existingVideoFolder) {
             validVideoFolder = existingVideoFolder;
             console.log('✅ Found existing VideoFolder:', existingVideoFolder._id);
           }
         } catch (error) {
           console.log('Error checking existing video folder:', error.message);
         }
       }
       
       if (!validVideoFolder) {
         console.log('❌ Video folder validation failed for:', {
           videoFolderId,
           mentorId,
           message: 'Folder not found or not accessible to this mentor'
         });
         return res.status(400).json({ 
           success: false, 
           message: 'Selected video folder does not exist or is not accessible. Please ensure the folder is approved or created by you.' 
         });
       }

       const videoData = {
         mentorId,
         title: videoTitle,
         description: videoDescription,
         type,
         folderId: videoFolderId,
         sourceType,
         status: 'pending',
         requestDate: new Date()
       };

       // Add URL or file data based on source type
       if (sourceType === 'url') {
         videoData.link = link;
       } else if (sourceType === 'upload' && req.file) {
         videoData.videoFile = {
           data: req.file.buffer,
           contentType: req.file.mimetype,
           filename: `${Date.now()}_${req.file.originalname}`,
           originalName: req.file.originalname,
           size: req.file.size,
           uploadDate: new Date()
         };
       }
       
       newRequest = new VideoRequest(videoData);
       break;
       
     default:
       return res.status(400).json({ 
         success: false, 
         message: 'Invalid request type' 
       });
   }

   console.log('💾 Saving request...');
   const savedRequest = await newRequest.save();
   
   console.log('✅ Request created successfully:', savedRequest._id);
   
   res.status(201).json({
     success: true,
     message: 'Request submitted successfully',
     request: {
       ...savedRequest.toObject(),
       requestType
     }
   });

 } catch (error) {
   console.error('❌ Error creating request:', error);
   
   if (error.code === 'LIMIT_FILE_SIZE') {
     return res.status(400).json({ 
       success: false, 
       message: 'File size too large. Maximum size is 100MB.' 
     });
   }
   
   if (error.message.includes('Only PDF files are allowed')) {
     return res.status(400).json({ 
       success: false, 
       message: 'Only PDF files are allowed for PDF requests.' 
     });
   }

   if (error.message.includes('Only video files are allowed')) {
     return res.status(400).json({ 
       success: false, 
       message: 'Only video files are allowed for video upload requests.' 
     });
   }
   
   res.status(500).json({ 
     success: false, 
     message: error.message || 'An error occurred while creating the request'
   });
 }
});

// DOWNLOAD PDF FILE
router.get('/download/pdf/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { view } = req.query; // <-- Add this line

    if (!/^[0-9a-fA-F]{24}$/.test(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    const pdfRequest = await PDFRequest.findById(requestId);

    if (!pdfRequest || !pdfRequest.pdf || !pdfRequest.pdf.data) {
      return res.status(404).json({ error: 'PDF file not found' });
    }

    res.set({
      'Content-Type': pdfRequest.pdf.contentType,
      'Content-Disposition': `${view ? 'inline' : 'attachment'}; filename="${pdfRequest.pdf.originalName}"`,
      'Content-Length': pdfRequest.pdf.size
    });

    res.send(pdfRequest.pdf.data);

  } catch (error) {
    console.error('❌ Error downloading PDF:', error);
    res.status(500).json({ error: 'Error downloading file' });
  }
});

// STREAM VIDEO FILE
router.get('/stream/video/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    
    if (!/^[0-9a-fA-F]{24}$/.test(requestId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    const videoRequest = await VideoRequest.findById(requestId);
    
    if (!videoRequest || !videoRequest.videoFile || !videoRequest.videoFile.data) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    const range = req.headers.range;
    const videoSize = videoRequest.videoFile.size;
    const videoData = videoRequest.videoFile.data;

    if (range) {
      // Support for video streaming with range requests
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : videoSize - 1;
      const chunksize = (end - start) + 1;
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${videoSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': videoRequest.videoFile.contentType,
      });
      
      res.end(videoData.slice(start, end + 1));
    } else {
      res.writeHead(200, {
        'Content-Length': videoSize,
        'Content-Type': videoRequest.videoFile.contentType,
      });
      res.end(videoData);
    }
    
  } catch (error) {
    console.error('❌ Error streaming video:', error);
    res.status(500).json({ error: 'Error streaming video' });
  }
});

// GET APPROVED FOLDERS FOR PDF REQUESTS
router.get('/approved-folders/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    
    if (!mentorId || !/^[0-9a-fA-F]{24}$/.test(mentorId)) {
      return res.status(400).json({ error: 'Valid mentor ID is required' });
    }
    
    const approvedFolderRequests = await FolderRequest.find({ 
      mentorId, 
      status: 'approved' 
    }).select('folderTitle _id');
    
    let existingFolders = [];
    if (Folder && Folder.find) {
      try {
        existingFolders = await Folder.find({ 
          createdBy: mentorId
        }).select('title _id');
      } catch (error) {
        console.log('❌ Error fetching existing folders:', error.message);
      }
    }
    
    const folders = [
      ...approvedFolderRequests.map(req => ({ 
        _id: req._id, 
        folderTitle: req.folderTitle,
        source: 'request'
      })),
      ...existingFolders.map(folder => ({ 
        _id: folder._id, 
        folderTitle: folder.title,
        source: 'existing'
      }))
    ];
    
    res.json({ 
      success: true,
      folders 
    });
    
  } catch (error) {
    console.error('❌ Error fetching approved folders:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// GET APPROVED VIDEO FOLDERS FOR VIDEO REQUESTS
router.get('/approved-video-folders/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    
    if (!mentorId || !/^[0-9a-fA-F]{24}$/.test(mentorId)) {
      return res.status(400).json({ error: 'Valid mentor ID is required' });
    }
    
    const approvedVideoFolderRequests = await VideoFolderRequest.find({ 
      mentorId, 
      status: 'approved' 
    }).select('folderTitle _id');
    
    let existingVideoFolders = [];
    if (VideoFolder && VideoFolder.find) {
      try {
        existingVideoFolders = await VideoFolder.find({ 
          createdBy: mentorId
        }).select('folderTitle _id');
      } catch (error) {
        console.log('❌ Error fetching existing video folders:', error.message);
      }
    }
    
    const folders = [
      ...approvedVideoFolderRequests.map(req => ({ 
        _id: req._id, 
        folderTitle: req.folderTitle,
        source: 'request'  
      })),
      ...existingVideoFolders.map(folder => ({ 
        _id: folder._id, 
        folderTitle: folder.folderTitle,
        source: 'existing'
      }))
    ];
    
    res.json({ 
      success: true,
      folders 
    });
    
  } catch (error) {
    console.error('❌ Error fetching approved video folders:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: error.message 
    });
  }
});

module.exports = router;