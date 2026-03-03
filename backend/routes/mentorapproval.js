const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth'); // Get the correct middlewares
const { Mentor } = require('../models/roles'); // Correct import

// Get all pending mentors - require admin role
router.get('/admin/mentors/pending', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const pendingMentors = await Mentor.find({ status: 'pending' })
      .select('-password') // Exclude password from response
      .sort({ requestDate: 1 }); // Sort by request date (oldest first)
    
    res.status(200).json(pendingMentors);
    console.log(pendingMentors);
  } catch (error) {
    console.error("Error fetching pending mentors:", error);
    res.status(500).json({ error: error.message });
  }
});

// Approve a mentor - require admin role
router.patch('/admin/mentors/:mentorId/approve', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const mentor = await Mentor.findByIdAndUpdate(
      req.params.mentorId,
      { status: 'approved', approvalDate: Date.now() },
      { new: true }
    ).select('-password');
    
    if (!mentor) {
      return res.status(404).json({ message: 'Mentor not found' });
    }
    
    res.status(200).json({ message: 'Mentor approved successfully', mentor });
  } catch (error) {
    console.error("Error approving mentor:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reject a mentor - require admin role
router.patch('/admin/mentors/:mentorId/reject', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    
    const mentor = await Mentor.findByIdAndUpdate(
      req.params.mentorId,
      { status: 'rejected', approvalDate: Date.now(), rejectionReason },
      { new: true }
    ).select('-password');
    
    if (!mentor) {
      return res.status(404).json({ message: 'Mentor not found' });
    }
    
    res.status(200).json({ message: 'Mentor rejected', mentor });
  } catch (error) {
    console.error("Error rejecting mentor:", error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/admin/mentors/:mentorId/status', authenticateToken, requireRole(['admin']), async (req, res) => {
    try {
      const { status, reason } = req.body;
      
      // Validate status
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status value' });
      }
  
      // Prepare update object
      const updateData = {
        status,
        approvalDate: Date.now()
      };
  
      // Add reason if status is rejected
      if (status === 'rejected') {
        if (!reason) {
          return res.status(400).json({ message: 'Rejection reason is required' });
        }
        updateData.rejectionReason = reason;
      } else {
        // Clear rejection reason if status is not rejected
        updateData.rejectionReason = undefined;
      }
  
      const mentor = await Mentor.findByIdAndUpdate(
        req.params.mentorId,
        updateData,
        { new: true }
      ).select('-password');
      
      if (!mentor) {
        return res.status(404).json({ message: 'Mentor not found' });
      }
      
      res.status(200).json({
        message: `Mentor status updated to ${status}`,
        mentor
      });
    } catch (error) {
      console.error("Error updating mentor status:", error);
      res.status(500).json({ error: error.message });
    }
  });

  

  
  router.get('/mentors', authenticateToken, async (req, res) => {
    try {
      const { status, sortBy, order = 'asc', search } = req.query;
      
      // Build query
      let query = Mentor.find().select('-password');
      
      // Apply status filter if provided
      if (status) {
        if (['pending', 'approved', 'rejected'].includes(status)) {
          query = query.where('status', status);
        } else {
          return res.status(400).json({ message: 'Invalid status parameter' });
        }
      }
      
      // Apply search filter if provided
      if (search) {
        query = query.or([
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]);
      }
      
      // Apply sorting
      const sortField = sortBy || 'requestDate';
      const sortOrder = order === 'desc' ? -1 : 1;
      query = query.sort({ [sortField]: sortOrder });
      
      // Execute query
      const mentors = await query.exec();
      
      // Add count information
      const totalCount = mentors.length;
      const statusCounts = {
        total: totalCount,
        approved: mentors.filter(m => m.status === 'approved').length,
        pending: mentors.filter(m => m.status === 'pending').length,
        rejected: mentors.filter(m => m.status === 'rejected').length
      };
      
      res.status(200).json({
        mentors,
        counts: statusCounts,
        filters: {
          status,
          search,
          sortBy,
          order
        }
      });
    } catch (error) {
      console.error("Error fetching mentors:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get mentor by ID
  router.get('/mentors/:mentorId', authenticateToken, async (req, res) => {
    try {
      const mentor = await Mentor.findById(req.params.mentorId)
        .select('-password');
      
      if (!mentor) {
        return res.status(404).json({ message: 'Mentor not found' });
      }
      
      res.status(200).json(mentor);
    } catch (error) {
      console.error("Error fetching mentor:", error);
      res.status(500).json({ error: error.message });
    }
  });

module.exports = router;