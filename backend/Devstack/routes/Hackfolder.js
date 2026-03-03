const express = require("express");
const Folder = require("../models/Hackfolder");
const { authenticateToken } = require("../../middleware/auth");

const router = express.Router();

// Create a new folder (Mentor)
router.post("/create", authenticateToken, async (req, res) => {
  try {
    const { title, description, createdBy } = req.body;

    if (!title || !description || !createdBy) {
      return res.status(400).json({ error: "Title, description, and createdBy are required" });
    }

    const folder = new Folder({ title, description, createdBy });
    await folder.save();

    res.status(201).json({ message: "Folder created successfully", folder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all folders
router.get("/", authenticateToken, async (req, res) => {
  try {
    const folders = await Folder.find()
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
    const folder = await Folder.findById(req.params.id)
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

    const folders = await Folder.find({ status })
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

    const folder = await Folder.findByIdAndUpdate(
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

// Delete folder by ID
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const folder = await Folder.findByIdAndDelete(req.params.id);
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

    const folder = await Folder.findByIdAndUpdate(
      id,
      { title, description },
      { new: true }
    );

    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    res.json({ message: "Folder updated successfully", folder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;