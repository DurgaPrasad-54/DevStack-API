const express = require('express');
const router = express.Router();
const RoomAllocationBatch = require('../Models/roomallocation');
const Hackathon = require('../Models/HackathonAdmin');
const { Mentor } = require('../../models/roles');

// Get all hackathons for dropdown with college and year filtering
router.get('/hackathons', async (req, res) => {
  try {
    const { coordinatorYear, coordinatorCollege } = req.query;
    
    let filter = {};
    
    // Add year filter if provided
    if (coordinatorYear) {
      filter.year = coordinatorYear;
    }
    
    // Add college filter if provided - FIX: Use correct parameter name
    if (coordinatorCollege) {
      filter.colleges = { $in: [coordinatorCollege] }; // Check if college exists in colleges array
    }
    
    const hackathons = await Hackathon.find(filter, 'hackathonname _id year colleges');
    
    res.json({
      success: true,
      data: hackathons
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching hackathons',
      error: error.message
    });
  }
});

// Get all approved mentors
router.get('/mentors', async (req, res) => {
  try {
    const mentors = await Mentor.find({ status: 'approved' }, 'name _id email');
    res.json({
      success: true,
      data: mentors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching mentors',
      error: error.message
    });
  }
});

// Create room allocation batch request
router.post("/create", async (req, res) => {
  try {
    const { allocations, submittedBy } = req.body;

    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one allocation is required",
      });
    }

    // Validate all allocations belong to same hackathon
    const hackathonIds = [...new Set(allocations.map((a) => a.hackathon))];
    if (hackathonIds.length !== 1) {
      return res.status(400).json({
        success: false,
        message: "All allocations must be for the same hackathon",
      });
    }

    // Check for existing batch for this user + hackathon
    const existingBatch = await RoomAllocationBatch.findOne({
      submittedBy,
      "allocations.hackathon": hackathonIds[0],
    });

    if (existingBatch) {
      return res.status(409).json({
        success: false,
        message: "You have already created a batch for this hackathon",
      });
    }

    // Validate each allocation
    for (const alloc of allocations) {
      const { hackathon, campusName, branch, mentor, roomNumber } = alloc;

      if (
        !hackathon ||
        !campusName?.trim() ||
        !branch?.trim() ||
        !mentor ||
        !roomNumber?.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "All fields are required for each allocation",
        });
      }

      // Check hackathon exists
      const hackathonExists = await Hackathon.findById(hackathon);
      if (!hackathonExists) {
        return res.status(404).json({
          success: false,
          message: `Hackathon not found for allocation: Room ${roomNumber}`,
        });
      }

      // Check mentor exists and approved
      const mentorExists = await Mentor.findOne({ _id: mentor, status: "approved" });
      if (!mentorExists) {
        return res.status(404).json({
          success: false,
          message: `Mentor not found or not approved for allocation: Room ${roomNumber}`,
        });
      }
    }

    const newBatch = new RoomAllocationBatch({
      allocations,
      submittedBy: submittedBy?.trim() || "Anonymous",
    });

    await newBatch.save();

    // Populate hackathon + mentor details for response
    const batchPopulated = await RoomAllocationBatch.findById(newBatch._id)
      .populate("allocations.hackathon", "hackathonname")
      .populate("allocations.mentor", "name email");

    res.status(201).json({
      success: true,
      message: "Room allocation batch created successfully",
      data: batchPopulated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating room allocation batch",
      error: error.message,
    });
  }
});

// Edit existing batch allocations (replace all allocations for the batch)
router.put('/edit/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { allocations } = req.body;

    if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one allocation is required'
      });
    }

    // Validate all allocations have same hackathon
    const hackathonIds = [...new Set(allocations.map(a => a.hackathon))];
    if (hackathonIds.length !== 1) {
      return res.status(400).json({
        success: false,
        message: 'All allocations must be for the same hackathon'
      });
    }

    // Validate each allocation
    for (const alloc of allocations) {
      const { hackathon, campusName, branch, mentor, roomNumber } = alloc;

      if (!hackathon || !campusName?.trim() || !branch?.trim() || !mentor || !roomNumber?.trim()) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required for each allocation'
        });
      }

      // Check hackathon exists
      const hackathonExists = await Hackathon.findById(hackathon);
      if (!hackathonExists) {
        return res.status(404).json({
          success: false,
          message: `Hackathon not found for allocation: Room ${roomNumber}`
        });
      }

      // Check mentor exists and approved
      const mentorExists = await Mentor.findOne({ _id: mentor, status: 'approved' });
      if (!mentorExists) {
        return res.status(404).json({
          success: false,
          message: `Mentor not found or not approved for allocation: Room ${roomNumber}`
        });
      }
    }

    const batch = await RoomAllocationBatch.findById(id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    batch.allocations = allocations;
    batch.status = 'pending';
    batch.rejectionReason = null;
    await batch.save();

    const populatedBatch = await RoomAllocationBatch.findById(id)
      .populate('allocations.hackathon', 'hackathonname')
      .populate('allocations.mentor', 'name email');

    res.json({
      success: true,
      message: 'Room allocation batch updated successfully',
      data: populatedBatch
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating batch',
      error: error.message
    });
  }
});

// Get batches submitted by a specific user
router.get('/user/:submittedBy', async (req, res) => {
  try {
    const { submittedBy } = req.params;
    const batches = await RoomAllocationBatch.find({ submittedBy })
      .populate('allocations.hackathon', 'hackathonname')
      .populate('allocations.mentor', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: batches
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching batches',
      error: error.message
    });
  }
});

// Get batches for a given hackathon with submittedBy info
router.get('/hackathon/:hackathonId', async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const batches = await RoomAllocationBatch.find({ 'allocations.hackathon': hackathonId })
      .populate('allocations.hackathon', 'hackathonname year')
      .populate('allocations.mentor', 'name email')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: batches
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching batches for hackathon',
      error: error.message
    });
  }
});

// Get all room allocation batches (admin) - UPDATED WITH HACKATHON FILTERING
router.get('/admin/all', async (req, res) => {
  try {
    const { status, page = 1, limit = 10, hackathonId } = req.query;
    let filter = {};
    if (status) filter.status = status;
    if (hackathonId) filter['allocations.hackathon'] = hackathonId;

    const skip = (page - 1) * limit;

    const batches = await RoomAllocationBatch.find(filter)
      .populate('allocations.hackathon', 'hackathonname')
      .populate('allocations.mentor', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await RoomAllocationBatch.countDocuments(filter);

    res.json({
      success: true,
      data: batches,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        totalRecords: total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching allocation batches',
      error: error.message
    });
  }
});

// Get specific batch details by ID (Admin) - NEW ROUTE ADDED
router.get('/admin/batch/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { hackathonId } = req.query; // Optional hackathon filter
    
    const batch = await RoomAllocationBatch.findById(id)
      .populate('allocations.hackathon', 'hackathonname year colleges')
      .populate('allocations.mentor', 'name email');

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    // Filter allocations by hackathon if hackathonId is provided
    let filteredAllocations = batch.allocations;
    if (hackathonId) {
      filteredAllocations = batch.allocations.filter(allocation => 
        allocation.hackathon._id.toString() === hackathonId
      );
    }

    // Format the response to match what your frontend expects
    const responseData = {
      _id: batch._id,
      submittedBy: batch.submittedBy,
      status: batch.status,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      rejectionReason: batch.rejectionReason,
      allocations: filteredAllocations.map(allocation => ({
        _id: allocation._id,
        hackathon: allocation.hackathon,
        hackathonYear: allocation.hackathonYear,
        campus: allocation.campusName, // Map campusName to campus
        branch: allocation.branch,
        mentorname: allocation.mentor?.name || 'N/A', // Map mentor.name to mentorname
        mentorName: allocation.mentor?.name || 'N/A', // Also provide mentorName
        roomno: allocation.roomNumber, // Map roomNumber to roomno
        roomNo: allocation.roomNumber, // Also provide roomNo
        mentor: allocation.mentor
      }))
    };

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching batch details',
      error: error.message
    });
  }
});

// Update batch status (Admin)
router.patch('/admin/update-status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const updateData = { status };
    if (status === 'rejected' && rejectionReason) updateData.rejectionReason = rejectionReason;

    const batch = await RoomAllocationBatch.findByIdAndUpdate(
      id, updateData, { new: true }
    )
      .populate('allocations.hackathon', 'hackathonname')
      .populate('allocations.mentor', 'name email');

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Room allocation batch not found'
      });
    }

    res.json({
      success: true,
      message: `Room allocation batch ${status} successfully`,
      data: batch
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating batch status',
      error: error.message
    });
  }
});

// Bulk update batch status
router.patch('/admin/bulk-update', async (req, res) => {
  try {
    const { ids, status, rejectionReason } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'IDs array is required'
      });
    }
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const updateData = { status };
    if (status === 'rejected' && rejectionReason) updateData.rejectionReason = rejectionReason;

    const result = await RoomAllocationBatch.updateMany(
      { _id: { $in: ids } },
      updateData
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} batches updated successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error bulk updating batches',
      error: error.message
    });
  }
});

// Delete room allocation batch
router.delete('/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await RoomAllocationBatch.findByIdAndDelete(id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Allocation batch not found'
      });
    }
    res.json({
      success: true,
      message: 'Allocation batch deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting batch',
      error: error.message
    });
  }
});

// Admin statistics
router.get('/admin/stats', async (req, res) => {
  try {
    const stats = await RoomAllocationBatch.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const total = await RoomAllocationBatch.countDocuments();

    // Default all counts to 0 to handle missing statuses in aggregation
    const formattedStats = {
      total,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
    });

    res.json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching stats',
      error: error.message
    });
  }
});

// Get hackathons with college details (for admin/debugging purposes)
router.get('/admin/hackathons-detailed', async (req, res) => {
  try {
    const hackathons = await Hackathon.find({}, 'hackathonname _id year colleges');
    res.json({
      success: true,
      data: hackathons
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching detailed hackathons',
      error: error.message
    });
  }
});

// Get colleges for a specific hackathon (utility endpoint)
router.get('/hackathon/:hackathonId/colleges', async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const hackathon = await Hackathon.findById(hackathonId, 'colleges hackathonname');
    
    if (!hackathon) {
      return res.status(404).json({
        success: false,
        message: 'Hackathon not found'
      });
    }

    res.json({
      success: true,
      data: {
        hackathonName: hackathon.hackathonname,
        colleges: hackathon.colleges || []
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching colleges for hackathon',
      error: error.message
    });
  }
});

// Validate college against hackathon (utility endpoint)
router.post('/validate-college', async (req, res) => {
  try {
    const { hackathonId, collegeName } = req.body;
    
    if (!hackathonId || !collegeName) {
      return res.status(400).json({
        success: false,
        message: 'Hackathon ID and college name are required'
      });
    }

    const hackathon = await Hackathon.findById(hackathonId, 'colleges hackathonname');
    
    if (!hackathon) {
      return res.status(404).json({
        success: false,
        message: 'Hackathon not found'
      });
    }

    const isValid = hackathon.colleges && hackathon.colleges.includes(collegeName.trim());

    res.json({
      success: true,
      data: {
        isValid,
        hackathonName: hackathon.hackathonname,
        collegeName: collegeName.trim(),
        availableColleges: hackathon.colleges || []
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error validating college',
      error: error.message
    });
  }
});

// Get approved room allocation schedule for a specific hackathon
router.get('/schedule/approved/:hackathonId', async (req, res) => {
  try {
    const { hackathonId } = req.params;
    
    // Find all approved batches for the specific hackathon
    const approvedBatches = await RoomAllocationBatch.find({ 
      'allocations.hackathon': hackathonId,
      status: 'approved'
    })
      .populate('allocations.hackathon', 'hackathonname year colleges')
      .populate('allocations.mentor', 'name email')
      .sort({ createdAt: -1 });

    if (!approvedBatches || approvedBatches.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No approved room allocations found for this hackathon'
      });
    }

    // Flatten all allocations from approved batches and filter by hackathon
    const allApprovedAllocations = [];
    
    approvedBatches.forEach(batch => {
      const hackathonAllocations = batch.allocations.filter(
        allocation => allocation.hackathon._id.toString() === hackathonId
      );
      
      hackathonAllocations.forEach(allocation => {
        allApprovedAllocations.push({
          _id: allocation._id,
          hackathon: allocation.hackathon,
          hackathonYear: allocation.hackathonYear,
          campusName: allocation.campusName,
          branch: allocation.branch,
          mentor: allocation.mentor,
          roomNumber: allocation.roomNumber,
          submittedBy: batch.submittedBy,
          approvedAt: batch.updatedAt,
          batchId: batch._id
        });
      });
    });

    // Group allocations by campus and branch for better organization
    const groupedAllocations = allApprovedAllocations.reduce((acc, allocation) => {
      const campus = allocation.campusName;
      const branch = allocation.branch;
      
      if (!acc[campus]) {
        acc[campus] = {};
      }
      if (!acc[campus][branch]) {
        acc[campus][branch] = [];
      }
      
      acc[campus][branch].push(allocation);
      return acc;
    }, {});

    // Get hackathon details
    const hackathonDetails = allApprovedAllocations.length > 0 
      ? allApprovedAllocations[0].hackathon 
      : null;

    res.json({
      success: true,
      data: {
        hackathon: hackathonDetails,
        totalAllocations: allApprovedAllocations.length,
        totalBatches: approvedBatches.length,
        allocations: allApprovedAllocations,
        groupedAllocations: groupedAllocations,
        lastUpdated: Math.max(...approvedBatches.map(b => new Date(b.updatedAt).getTime()))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching approved room allocation schedule',
      error: error.message
    });
  }
});

module.exports = router;