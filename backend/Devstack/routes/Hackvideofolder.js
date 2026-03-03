const express = require("express");
const multer = require("multer");
const VideoFolder = require("../Models/Hackvideofolder");
const { authenticateToken } = require("../../middleware/auth");

const router = express.Router();

// Multer for memory storage (thumbnail images)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// Create a new folder (Mentor)
router.post("/create", authenticateToken, upload.single("thumbnail"), async (req, res) => {
  try {
    const { title, description, createdBy } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "Thumbnail image is required" });
    }

    const folder = new VideoFolder({
      title,
      description,
      createdBy,
      thumbnail: {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      },
    });

    await folder.save();
    res.status(201).json({ message: "Folder created successfully", folder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all folders
router.get("/", authenticateToken, async (req, res) => {
  try {
    const folders = await VideoFolder.find()
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get folder by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const folder = await VideoFolder.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    res.json(folder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get folders by status
router.get("/status/:status", authenticateToken, async (req, res) => {
  try {
    const { status } = req.params;

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const folders = await VideoFolder.find({ status })
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    res.json(folders);
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

    const folder = await VideoFolder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    res.json({ message: `Folder ${status}`, folder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve folder thumbnail image
router.get("/thumbnail/:id", async (req, res) => {
  try {
    const folder = await VideoFolder.findById(req.params.id);

    if (!folder || !folder.thumbnail || !folder.thumbnail.data) {
      return res.status(404).json({ error: "Thumbnail not found" });
    }

    res.set("Content-Type", folder.thumbnail.contentType);
    res.send(folder.thumbnail.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete video folder by ID
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const folder = await VideoFolder.findByIdAndDelete(req.params.id);
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    res.json({ message: "Folder deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: "Title and description are required" });
    }

    const folder = await VideoFolder.findByIdAndUpdate(
      id,
      { title, description },
      { new: true }
    );

    if (!folder) {
      return res.status(404).json({ error: "Video folder not found" });
    }

    res.json({ message: "Video folder updated successfully", folder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




module.exports = router;
