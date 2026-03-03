const express = require("express");
const multer = require("multer");
const Notes = require("../Models/Hacknotes");
const Folder = require("../Models/Hackfolder");
const { authenticateToken } = require("../../middleware/auth");

const router = express.Router();

// Multer for memory storage (PDF upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // max 50MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"), false);
    }
  },
});

// Upload note (PDF) inside a folder
router.post("/upload", authenticateToken, upload.single("pdf"), async (req, res) => {
  try {
    const { folderId, title, createdBy } = req.body;

    // Validate required fields
    if (!folderId || !title || !createdBy) {
      return res.status(400).json({ error: "folderId, title, and createdBy are required" });
    }

    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "PDF file is required" });
    }

    // Validate PDF file has content
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: "PDF file is empty" });
    }

    const note = new Notes({
      folder: folderId,
      title,
      createdBy,
      pdf: {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      },
    });

    await note.save();
    res.status(201).json({ message: "Note uploaded successfully", note });
  } catch (err) {
    console.error("Error uploading note:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get all notes in a folder
router.get("/folder/:folderId", authenticateToken, async (req, res) => {
  try {
    const { folderId } = req.params;
    
    if (!folderId) {
      return res.status(400).json({ error: "Folder ID is required" });
    }

    const notes = await Notes.find({ folder: folderId })
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .select('-pdf.data') // Exclude PDF data from list view for performance
      .sort({ createdAt: -1 });

    res.json(notes);
  } catch (err) {
    console.error("Error fetching notes:", err);
    res.status(500).json({ error: err.message });
  }
});

// Stream PDF file
router.get("/stream/:noteId", async (req, res) => {
  try {
    const { noteId } = req.params;
    
    if (!noteId) {
      return res.status(400).json({ error: "Note ID is required" });
    }

    const note = await Notes.findById(noteId);

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    if (!note.pdf || !note.pdf.data || note.pdf.data.length === 0) {
      return res.status(404).json({ error: "PDF content not found" });
    }

    // Set appropriate headers for PDF streaming
    res.set({
      'Content-Type': note.pdf.contentType || 'application/pdf',
      'Content-Length': note.pdf.data.length,
      'Cache-Control': 'public, max-age=3600'
    });

    res.send(note.pdf.data);
  } catch (err) {
    console.error("Error streaming PDF:", err);
    res.status(500).json({ error: "Error streaming PDF file" });
  }
});

// Download PDF file
router.get("/download/:noteId", async (req, res) => {
  try {
    const { noteId } = req.params;
    
    if (!noteId) {
      return res.status(400).json({ error: "Note ID is required" });
    }

    const note = await Notes.findById(noteId);
    
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    if (!note.pdf || !note.pdf.data || note.pdf.data.length === 0) {
      return res.status(404).json({ error: "PDF content not found" });
    }

    // Sanitize filename for download
    const sanitizedTitle = note.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_');
    const filename = `${sanitizedTitle}.pdf`;

    res.set({
      'Content-Type': note.pdf.contentType || 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': note.pdf.data.length
    });

    res.send(note.pdf.data);
  } catch (err) {
    console.error("Error downloading PDF:", err);
    res.status(500).json({ error: "Error downloading PDF file" });
  }
});

// Get notes by status
router.get("/status/:status", authenticateToken, async (req, res) => {
  try {
    const { status } = req.params;
    
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be: pending, approved, or rejected" });
    }

    const notes = await Notes.find({ status })
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("folder", "title")
      .select('-pdf.data') // Exclude PDF data for performance
      .sort({ createdAt: -1 });

    res.json(notes);
  } catch (err) {
    console.error("Error fetching notes by status:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update note status
router.put("/:id/status", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, approvedBy } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Note ID is required" });
    }

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be: pending, approved, or rejected" });
    }

    // Check if note exists
    const existingNote = await Notes.findById(id);
    if (!existingNote) {
      return res.status(404).json({ error: "Note not found" });
    }

    const updateData = { status };
    
    // Only set approvedBy if status is approved or rejected
    if (status !== "pending") {
      if (!approvedBy) {
        return res.status(400).json({ error: "approvedBy is required when approving or rejecting" });
      }
      updateData.approvedBy = approvedBy;
    } else {
      // Clear approvedBy when setting back to pending
      updateData.approvedBy = null;
    }

    const note = await Notes.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate("createdBy", "name email")
     .populate("approvedBy", "name email")
     .populate("folder", "title");

    res.json({ message: `Note ${status} successfully`, note });
  } catch (err) {
    console.error("Error updating note status:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete note by ID
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: "Note ID is required" });
    }

    const note = await Notes.findByIdAndDelete(id);
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    res.json({ message: "Note deleted successfully" });
  } catch (err) {
    console.error("Error deleting note:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get single note details (without PDF data)
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: "Note ID is required" });
    }

    const note = await Notes.findById(id)
      .populate("createdBy", "name email")
      .populate("approvedBy", "name email")
      .populate("folder", "title")
      .select('-pdf.data'); // Exclude PDF data

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    res.json(note);
  } catch (err) {
    console.error("Error fetching note:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;