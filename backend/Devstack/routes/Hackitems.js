const express = require("express");
const Item = require("../models/Hackitems");
const { authenticateToken } = require("../../middleware/auth");

const router = express.Router();

// Create a new item (Mentor)
router.post("/create", authenticateToken, async (req, res) => {
  try {
    const { title, description, link, createdBy } = req.body;

    if (!title || !description || !link || !createdBy) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const item = new Item({ title, description, link, createdBy });
    await item.save();

    res.status(201).json({ message: "Item created successfully", item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all items
router.get("/", authenticateToken, async (req, res) => {
  try {
    const items = await Item.find()
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get item by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get items by status (pending / approved / rejected)
router.get("/status/:status", authenticateToken, async (req, res) => {
  try {
    const { status } = req.params;

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const items = await Item.find({ status })
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email");

    res.json(items);
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

    const item = await Item.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ message: `Item ${status}`, item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete item by ID
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }
    res.json({ message: "Item deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, link } = req.body;

    if (!title || !description || !link) {
      return res.status(400).json({ error: "Title, description, and link are required" });
    }

    const item = await Item.findByIdAndUpdate(
      id,
      { title, description, link },
      { new: true }
    );

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.json({ message: "Item updated successfully", item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;