const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const Video = require("../models/Hackvideo");
const VideoFolder = require("../models/Hackvideofolder");
const { authenticateToken } = require("../../middleware/auth");

const router = express.Router();

// Multer for memory storage (video files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1000 * 1024 * 1024 }, // 1000MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"), false);
    }
  },
});

// Upload video (either file or link) inside a folder
router.post("/upload", authenticateToken, upload.single("videoFile"), async (req, res) => {
  try {
    const { folderId, title, videoLink, createdBy } = req.body;

    const folder = await VideoFolder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    if (!videoLink && !req.file) {
      return res.status(400).json({ error: "Provide a video link or upload a file" });
    }

    const newVideo = new Video({
      folder: folderId,
      title,
      videoLink: videoLink || null,
      createdBy,
      videoFile: req.file
        ? {
            data: req.file.buffer,
            contentType: req.file.mimetype,
          }
        : undefined,
    });

    await newVideo.save();
    res.status(201).json({ message: "Video uploaded successfully", video: newVideo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all videos in a folder
router.get("/folder/:folderId", authenticateToken, async (req, res) => {
  try {
    const videos = await Video.find({ folder: req.params.folderId })
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stream video file (if stored in DB)
router.get("/stream/:videoId", authenticateToken, async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId);

    if (!video || !video.videoFile || !video.videoFile.data) {
      return res.status(404).json({ error: "Video file not found" });
    }

    res.set("Content-Type", video.videoFile.contentType);
    res.send(video.videoFile.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get videos by status
router.get("/status/:status", authenticateToken, async (req, res) => {
  try {
    const { status } = req.params;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const videos = await Video.find({ status })
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ FIXED: Allow pending status in status updates
router.put("/:id/status", authenticateToken, async (req, res) => {
  try {
    const { status, approvedBy } = req.body;

    // ✅ FIXED: Include "pending" in valid statuses
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const updateData = { status };
    
    // Only set approvedBy if status is approved or rejected
    if (status !== "pending") {
      updateData.approvedBy = approvedBy;
    } else {
      // Clear approvedBy when setting back to pending
      updateData.approvedBy = null;
    }

    const video = await Video.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    res.json({ message: `Video ${status}`, video });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete video by ID
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const video = await Video.findByIdAndDelete(req.params.id);
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    res.json({ message: "Video deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router;