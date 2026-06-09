const express = require('express');
const router = express.Router();
const Hackathon = require('../Models/HackathonAdmin');
const upload = require("../middleware/upload");
const { authenticateToken } = require("../../middleware/auth");
const { logger } = require('../../utils/logger');
const { calculateStatus } = require('../utils/hackathonUtils');

// Admin check middleware
const isAdmin = (req, res, next) => {
  const role = req.user.role || req.user.userRole || req.user.type;
  if (role !== 'admin') {
    logger.warn("Access denied. Admins only.", { userId: req.user.userId, role });
    return res.status(403).json({ message: "Access denied. Admins only." });
  }
  next();
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
        hackathonname: data.hackathonname, 
        college: data.college, 
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
      logger.info("Hackathon created successfully", { hackathonId: newHackathon._id, college: data.college });
      
      res.status(201).json({
        message: `Hackathon created successfully for ${collegeText}`,
        hackathon: newHackathon,
      });
    } catch (error) {
      logger.error("Hackathon creation error", { error: error.message });
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// Get all hackathons (Public) - Paginated, excludes large binary data
router.get('/all', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let hackathons = await Hackathon.find()
      .select('-hackathonposter -qrcode')
      .skip(skip)
      .limit(limit)
      .lean();

    // Only update status in-memory
    hackathons = hackathons.map(h => {
      h.status = calculateStatus(h.regstart, h.enddate);
      return h;
    });

    res.json(hackathons);
  } catch (error) {
    logger.error("Error fetching all hackathons", { error: error.message });
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /hackathon - Return all hackathons - Paginated, excludes large binary data
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let hackathons = await Hackathon.find()
      .select('-hackathonposter -qrcode')
      .skip(skip)
      .limit(limit)
      .lean();

    hackathons = hackathons.map(h => {
      h.status = calculateStatus(h.regstart, h.enddate);
      return h;
    });

    res.json(hackathons);
  } catch (err) {
    logger.error("Failed to fetch hackathons", { error: err.message });
    res.status(500).json({ error: 'Failed to fetch hackathons' });
  }
});

// Get hackathon by ID - Returns single hackathon (with poster and qrcode)
router.get('/:id', async (req, res) => {
  try {
    const hackathon = await Hackathon.findById(req.params.id);
    if (!hackathon) {
      return res.status(404).json({ message: "Hackathon not found" });
    }

    // Dynamic status calculation in-memory (no write-on-read database update)
    const status = calculateStatus(hackathon.regstart, hackathon.enddate);
    hackathon.status = status;

    res.json(hackathon);
  } catch (error) {
    logger.error("Failed to fetch hackathon by ID", { error: error.message });
    res.status(500).json({ message: "Internal server error" });
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

      // Recalculate status in-memory
      data.status = calculateStatus(data.regstart, data.enddate);

      const updatedHackathon = await Hackathon.findByIdAndUpdate(
        req.params.id,
        { $set: data },
        { new: true, runValidators: true }
      );

      logger.info("Hackathon updated successfully", { hackathonId: req.params.id });

      res.json({
        message: "Hackathon updated successfully",
        hackathon: updatedHackathon,
      });
    } catch (error) {
      logger.error("Hackathon update error", { error: error.message });
      res.status(500).json({ message: "Internal server error" });
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
    logger.info("Hackathon deleted successfully", { hackathonId: req.params.id });
    res.json({ message: "Hackathon deleted successfully" });
  } catch (error) {
    logger.error("Hackathon deletion error", { error: error.message });
    res.status(500).json({ message: "Internal server error" });
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
    logger.error("Error fetching poster", { error: err.message });
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
    logger.error("Error fetching QR code", { error: err.message });
    res.status(500).send("Error fetching QR code");
  }
});

module.exports = router;
