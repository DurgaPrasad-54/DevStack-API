const express = require('express');
const router = express.Router();
const Hackathon = require('../Models/HackathonAdmin');
const upload = require("../middleware/upload");
const { authenticateToken } = require("../../middleware/auth");

// Admin check middleware
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }
  next();
};

// 🔹 Utility function to calculate status
const calculateStatus = (regstart, enddate) => {
  const now = new Date();
  if (now < regstart) return "upcoming";
  if (now >= regstart && now <= enddate) return "ongoing";
  return "completed";
};

// Create hackathon 
router.post(
  "/createhackathon",
  authenticateToken,
  isAdmin,
  upload.fields([
    { name: "hackathonposter", maxCount: 1 },
    { name: "qrcode", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const data = req.body;

      if (!req.files || !req.files.hackathonposter) {
        return res.status(400).json({ message: "Hackathon poster is required" });
      }

      const regstart = new Date(data.regstart);
      const enddate = new Date(data.enddate);

      const hackathonposterFile = req.files.hackathonposter[0];
      const qrcodeFile = req.files.qrcode ? req.files.qrcode[0] : null;

      // Create single hackathon for all colleges or specific college
      const hackathonData = {
        ...data,
        hackathonname: data.hackathonname, // Keep hackathon name as is without college suffix
        college: data.college, // Use "All" or specific college name
        startdate: new Date(data.startdate),
        enddate,
        regstart,
        regend: new Date(data.regend),
        status: calculateStatus(regstart, enddate),
        hackathonposter: {
          data: hackathonposterFile.buffer,
          contentType: hackathonposterFile.mimetype,
        },
        qrcode: qrcodeFile
          ? {
              data: qrcodeFile.buffer,
              contentType: qrcodeFile.mimetype,
            }
          : undefined,
      };

      const newHackathon = new Hackathon(hackathonData);
      await newHackathon.save();

      const collegeText = data.college === 'All' ? 'all colleges' : `${data.college} college`;
      res.status(201).json({
        message: `Hackathon created successfully for ${collegeText}`,
        hackathon: newHackathon,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Get all hackathons (Public)
router.get('/all', async (req, res) => {
  try {
    // Pagination support
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let hackathons = await Hackathon.find().skip(skip).limit(limit);

    // Only update status in-memory, do not write to DB on every GET
    hackathons = hackathons.map(h => {
      const status = calculateStatus(h.regstart, h.enddate);
      h.status = status;
      return h;
    });

    // Optionally, update status in DB asynchronously (background job recommended)
    // Do NOT use h.save() here, it blocks the event loop

    res.json(hackathons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /hackathon - Return all hackathons
router.get('/', async (req, res) => {
  try {
  const hackathons = await require('../Models/HackathonAdmin').find();
    res.json(hackathons);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch hackathons' });
  }
});

// Get hackathon by ID 
router.get('/:id', async (req, res) => {
  try {
    const hackathon = await Hackathon.findById(req.params.id);
    if (!hackathon) {
      return res.status(404).json({ message: "Hackathon not found" });
    }

    // 🔹 Update status if outdated
    const status = calculateStatus(hackathon.regstart, hackathon.enddate);
    if (hackathon.status !== status) {
      hackathon.status = status;
      await hackathon.save();
    }

    res.json(hackathon);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update hackathon 
router.put(
  '/:id',
  authenticateToken,
  isAdmin,
  upload.fields([
    { name: "hackathonposter", maxCount: 1 },
    { name: "qrcode", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const hackathon = await Hackathon.findById(req.params.id);
      if (!hackathon) return res.status(404).json({ message: "Hackathon not found" });

      const data = req.body;

      // Parse dates
      const parseDate = (value) => (value ? new Date(value) : undefined);
      data.regstart = parseDate(data.regstart) || hackathon.regstart;
      data.regend = parseDate(data.regend) || hackathon.regend;
      data.startdate = parseDate(data.startdate) || hackathon.startdate;
      data.enddate = parseDate(data.enddate) || hackathon.enddate;

      // Handle poster
      if (req.files && req.files.hackathonposter) {
        const hackathonposterFile = req.files.hackathonposter[0];
        data.hackathonposter = {
          data: hackathonposterFile.buffer,
          contentType: hackathonposterFile.mimetype,
        };
      }

      // Handle qrcode
      if (req.files && req.files.qrcode) {
        const qrcodeFile = req.files.qrcode[0];
        data.qrcode = {
          data: qrcodeFile.buffer,
          contentType: qrcodeFile.mimetype,
        };
      }

      // 🔹 Recalculate status
      data.status = calculateStatus(data.regstart, data.enddate);

      const updatedHackathon = await Hackathon.findByIdAndUpdate(
        req.params.id,
        { $set: data },
        { new: true, runValidators: true }
      );

      res.json({
        message: "Hackathon updated successfully",
        hackathon: updatedHackathon,
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// Delete hackathon 
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const hackathon = await Hackathon.findById(req.params.id);
    if (!hackathon) {
      return res.status(404).json({ message: "Hackathon not found" });
    }

    await Hackathon.findByIdAndDelete(req.params.id);
    res.json({ message: "Hackathon deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get hackathon poster
router.get("/poster/:id", async (req, res) => {
  try {
    const hackathon = await Hackathon.findById(req.params.id);
    if (!hackathon || !hackathon.hackathonposter) {
      return res.status(404).send("Poster not found");
    }

    res.set("Content-Type", hackathon.hackathonposter.contentType);
    res.send(hackathon.hackathonposter.data);
  } catch (err) {
    res.status(500).send("Error fetching poster");
  }
});

// Get hackathon QR code
router.get("/qrcode/:id", async (req, res) => {
  try {
    const hackathon = await Hackathon.findById(req.params.id);
    if (!hackathon || !hackathon.qrcode || !hackathon.qrcode.data) {
      return res.status(404).send("QR code not found");
    }

    res.set("Content-Type", hackathon.qrcode.contentType);
    res.send(hackathon.qrcode.data);
  } catch (err) {
    res.status(500).send("Error fetching QR code");
  }
});

module.exports = router;
