const express = require('express');
const router = express.Router();
const { Student } = require('../models/roles'); // <-- Fix: destructure Student

router.get('/students', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      currentYear,
      branch,
      college,
      year,
      search,
      sortBy = 'name',
      sortOrder = 'asc',
      includeAll = false // New parameter to optionally include all statuses
    } = req.query;

    // Build filter object - default to approved only
    const filter = {};
    
    // Only include status filter if not explicitly requesting all students
    if (includeAll !== 'true') {
      filter.status = 'approved'; // <-- ONLY APPROVED STUDENTS by default
    }
    
    if (currentYear) {
      filter.currentYear = currentYear;
    }
    
    if (branch) {
      filter.branch = new RegExp(branch, 'i'); // Case insensitive
    }
    
    if (college) {
      filter.college = new RegExp(college, 'i'); // Case insensitive
    }
    
    if (year) {
      filter.year = year;
    }
    
    // Search functionality (name, email, rollNo)
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { rollNo: new RegExp(search, 'i') }
      ];
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const students = await Student.find(filter)
      .select('-password') // Exclude password field
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean(); // Convert to plain objects for better performance

    // Get total count for pagination
    const totalCount = await Student.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);

    // Get statistics - also filter by approved status
    const statsFilter = { ...filter };
    delete statsFilter.$or; // Remove search filter for stats
    
    const stats = await Student.aggregate([
      { $match: statsFilter },
      {
        $group: {
          _id: '$currentYear',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        students,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalCount,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
          limit: limitNum
        },
        statistics: stats,
        filters: {
          currentYear,
          branch,
          college,
          year,
          search,
          sortBy,
          sortOrder,
          statusFilter: includeAll === 'true' ? 'all' : 'approved'
        }
      }
    });

  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Route to get unique values for filters (branches, colleges, etc.)
router.get('/students/filters/options', async (req, res) => {
  try {
    // Get unique branches
    const branches = await Student.distinct('branch');
    
    // Get unique colleges
    const colleges = await Student.distinct('college');
    
    // Get unique years
    const years = await Student.distinct('year');
    
    // Current year options
    const currentYears = ['first year', 'second year', 'third year', 'fourth year', 'alumni'];

    res.json({
      success: true,
      data: {
        branches: branches.sort(),
        colleges: colleges.sort(),
        years: years.sort(),
        currentYears
      }
    });

  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Route to get students count by various groupings
router.get('/students/analytics/summary', async (req, res) => {
  try {
    const { includeAll = false } = req.query;
    
    // Base filter for approved students only (unless explicitly requested otherwise)
    const baseFilter = includeAll === 'true' ? {} : { status: 'approved' };

    // Students by current year - APPROVED ONLY
    const byCurrentYear = await Student.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: '$currentYear',
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Students by branch - APPROVED ONLY
    const byBranch = await Student.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: '$branch',
          count: { $sum: 1 }
        }
      },
      { $sort: { 'count': -1 } }
    ]);

    // Students by college - APPROVED ONLY
    const byCollege = await Student.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: '$college',
          count: { $sum: 1 }
        }
      },
      { $sort: { 'count': -1 } }
    ]);

    // Students by admission year - APPROVED ONLY
    const byYear = await Student.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: '$year',
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': -1 } }
    ]);

    // Total count - APPROVED ONLY
    const totalStudents = await Student.countDocuments(baseFilter);

    res.json({
      success: true,
      data: {
        totalStudents,
        byCurrentYear,
        byBranch,
        byCollege,
        byYear,
        statusFilter: includeAll === 'true' ? 'all' : 'approved'
      }
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Route to get statistics for all years (useful for frontend dashboard)
router.get('/students/year-statistics', async (req, res) => {
  try {
    const { year, search, page = 1, limit = 100 } = req.query;
    const filter = { status: 'approved' }; // <-- ONLY APPROVED STUDENTS

    if (year && year !== 'all') {
      filter.year = year;
    }

    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { rollNo: new RegExp(search, 'i') }
      ];
    }

    // If search or year filter is present, return filtered students grouped by currentYear
    if (Object.keys(filter).length > 1) { // Changed from > 0 to > 1 since status filter is always present
      // Pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Get filtered students - ONLY APPROVED
      const students = await Student.find(filter)
        .select('-password')
        .skip(skip)
        .limit(limitNum)
        .lean();

      // Group students by currentYear
      const yearOrder = ['first year', 'second year', 'third year', 'fourth year', 'alumni'];
      const grouped = yearOrder.map(currentYear => {
        const groupStudents = students.filter(s => s.currentYear === currentYear);
        return {
          currentYear,
          count: groupStudents.length,
          students: groupStudents.map(s => ({
            id: s._id,
            name: s.name,
            year: s.year
          })),
          canPromote: currentYear !== 'alumni',
          canDemote: currentYear !== 'first year'
        };
      
      });

      return res.json({
        success: true,
        data: {
          statistics: grouped,
          totalStudents: students.length
        }
      });
    }

    // Default: return statistics for all APPROVED students grouped by currentYear
    const stats = await Student.aggregate([
      {
        $match: { status: 'approved' } // <-- ONLY APPROVED STUDENTS
      },
      {
        $group: {
          _id: '$currentYear',
          count: { $sum: 1 },
          students: { 
            $push: { 
              id: '$_id', 
              name: '$name', 
              year: '$year' 
            } 
          }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);
    
    const yearOrder = ['first year', 'second year', 'third year', 'fourth year', 'alumni'];
    const orderedStats = yearOrder.map(year => {
      const found = stats.find(stat => stat._id === year);
      return {
        currentYear: year,
        count: found ? found.count : 0,
        students: found ? found.students : [],
        canPromote: year !== 'alumni',
        canDemote: year !== 'first year'
      };
    });
    
    res.json({
      success: true,
      data: {
        statistics: orderedStats,
        totalStudents: stats.reduce((sum, stat) => sum + stat.count, 0)
      }
    });
    
  } catch (error) {
    console.error('Error getting year statistics:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Route to get a single student by ID
router.get('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const student = await Student.findById(id).select('-password');
    
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.json({
      success: true,
      data: {
        student
      }
    });

  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Helper function to get next year progression
const getNextProgression = (currentYear, year) => {
  const currentYearNum = parseInt(year);
  
  switch (currentYear) {
    case 'first year':
      return {
        newYear: (currentYearNum + 1).toString(),
        newCurrentYear: 'second year'
      };
    case 'second year':
      return {
        newYear: (currentYearNum + 1).toString(),
        newCurrentYear: 'third year'
      };
    case 'third year':
      return {
        newYear: (currentYearNum + 1).toString(),
        newCurrentYear: 'fourth year'
      };
    case 'fourth year':
      return {
        newYear: (currentYearNum + 1).toString(), // Year stays same when moving to alumni
        newCurrentYear: 'alumni'
      };
    default:
      return null; // Alumni - no progression possible
  }
};

// Helper function to get previous year progression
const getPreviousProgression = (currentYear, year) => {
  const currentYearNum = parseInt(year);
  
  switch (currentYear) {
    case 'second year':
      return {
        newYear: (currentYearNum - 1).toString(),
        newCurrentYear: 'first year'
      };
    case 'third year':
      return {
        newYear: (currentYearNum - 1).toString(),
        newCurrentYear: 'second year'
      };
    case 'fourth year':
      return {
        newYear: (currentYearNum - 1).toString(),
        newCurrentYear: 'third year'
      };
    case 'alumni':
      return {
        newYear: year, // Year stays same when moving from alumni
        newCurrentYear: 'fourth year'
      };
    default:
      return null; // First year - no demotion possible
  }
};

// Route to promote ALL students of a specific current year
router.patch('/students/promote-by-year/:currentYear', async (req, res) => {
  try {
    const { currentYear } = req.params;
    const { year } = req.query; // Optional admission year filter
    
    // Validate currentYear parameter
    const validYears = ['first year', 'second year', 'third year', 'fourth year'];
    if (!validYears.includes(currentYear)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid current year. Must be one of: first year, second year, third year, fourth year' 
      });
    }
    
    // Check if trying to promote alumni
    if (currentYear === 'alumni') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot promote alumni students. They have already completed all years.' 
      });
    }
    
    // Build filter for ONLY APPROVED students
    const filter = { 
      currentYear: currentYear,
      status: 'approved' // <-- ONLY APPROVED STUDENTS
    };
    
    // Add year filter if provided
    if (year && year.trim() !== '') {
      const numericYear = parseInt(year);
      if (!isNaN(numericYear)) {
        filter.year = numericYear.toString();
      }
    }
    
    // Find all APPROVED students with the specified current year
    const students = await Student.find(filter);
    
    if (students.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: `No approved students found in ${currentYear}${year ? ` from ${year} batch` : ''}` 
      });
    }
    
    const results = [];
    const errors = [];
    
    // Process each student
    for (const student of students) {
      try {
        const progression = getNextProgression(student.currentYear, student.year);
        if (!progression) {
          errors.push({ 
            studentId: student._id, 
            name: student.name,
            error: 'Invalid progression logic' 
          });
          continue;
        }
        
        const updatedStudent = await Student.findByIdAndUpdate(
          student._id,
          {
            year: progression.newYear,
            currentYear: progression.newCurrentYear
          },
          { new: true, runValidators: true }
        );
        
        results.push({
          studentId: student._id,
          name: student.name,
          from: student.currentYear,
          to: progression.newCurrentYear,
          newYear: progression.newYear
        });
        
      } catch (err) {
        errors.push({ 
          studentId: student._id, 
          name: student.name,
          error: err.message 
        });
      }
    }
    
    res.json({
      success: true,
      message: `Bulk promotion completed for approved ${currentYear} students${year ? ` from ${year} batch` : ''}. ${results.length} students promoted, ${errors.length} errors.`,
      data: {
        originalYear: currentYear,
        admissionYear: year || 'all',
        totalStudents: students.length,
        promoted: results,
        errors: errors
      }
    });
    
  } catch (error) {
    console.error('Error in bulk year promotion:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});


// Route to demote ALL students of a specific current year
router.patch('/students/demote-by-year/:currentYear', async (req, res) => {
  try {
    const { currentYear } = req.params;
    const { year } = req.query; // Optional admission year filter
    
    // Validate currentYear parameter
    const validYears = ['second year', 'third year', 'fourth year', 'alumni'];
    if (!validYears.includes(currentYear)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid current year. Must be one of: second year, third year, fourth year, alumni' 
      });
    }
    
    // Check if trying to demote first year
    if (currentYear === 'first year') {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot demote first year students. They are already in the lowest year.' 
      });
    }
    
    // Build filter for ONLY APPROVED students
    const filter = { 
      currentYear: currentYear,
      status: 'approved' // <-- ONLY APPROVED STUDENTS
    };
    
    // Add year filter if provided
    if (year && year.trim() !== '') {
      const numericYear = parseInt(year);
      if (!isNaN(numericYear)) {
        filter.year = numericYear.toString();
      }
    }
    
    // Find all APPROVED students with the specified current year
    const students = await Student.find(filter);
    
    if (students.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: `No approved students found in ${currentYear}${year ? ` from ${year} batch` : ''}` 
      });
    }
    
    const results = [];
    const errors = [];
    
    // Process each student
    for (const student of students) {
      try {
        const progression = getPreviousProgression(student.currentYear, student.year);
        if (!progression) {
          errors.push({ 
            studentId: student._id, 
            name: student.name,
            error: 'Invalid progression logic' 
          });
          continue;
        }
        
        const updatedStudent = await Student.findByIdAndUpdate(
          student._id,
          {
            year: progression.newYear,
            currentYear: progression.newCurrentYear
          },
          { new: true, runValidators: true }
        );
        
        results.push({
          studentId: student._id,
          name: student.name,
          from: student.currentYear,
          to: progression.newCurrentYear,
          newYear: progression.newYear
        });
        
      } catch (err) {
        errors.push({ 
          studentId: student._id, 
          name: student.name,
          error: err.message 
        });
      }
    }
    
    res.json({
      success: true,
      message: `Bulk demotion completed for approved ${currentYear} students${year ? ` from ${year} batch` : ''}. ${results.length} students demoted, ${errors.length} errors.`,
      data: {
        originalYear: currentYear,
        admissionYear: year || 'all',
        totalStudents: students.length,
        demoted: results,
        errors: errors
      }
    });
    
  } catch (error) {
    console.error('Error in bulk year demotion:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});





router.get('/admin/students/pending', async (req, res) => {
  try {
    const pendingStudents = await Student.find({ status: 'pending' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        students: pendingStudents,
        count: pendingStudents.length
      }
    });
  } catch (error) {
    console.error('Error fetching pending students:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Approve a student
router.patch('/admin/students/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { adminId } = req.body; // Pass admin ID from frontend

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    if (student.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Student is not in pending status'
      });
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      id,
      {
        status: 'approved',
        approvedBy: adminId,
        approvedAt: new Date()
      },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Student approved successfully',
      data: { student: updatedStudent }
    });
  } catch (error) {
    console.error('Error approving student:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Reject a student
router.patch('/admin/students/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, adminId } = req.body;

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    if (student.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Student is not in pending status'
      });
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      id,
      {
        status: 'rejected',
        rejectionReason: reason,
        approvedBy: adminId,
        approvedAt: new Date()
      },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Student rejected successfully',
      data: { student: updatedStudent }
    });
  } catch (error) {
    console.error('Error rejecting student:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Bulk approve students
router.patch('/admin/students/bulk-approve', async (req, res) => {
  try {
    const { studentIds, adminId } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Student IDs array is required'
      });
    }

    const result = await Student.updateMany(
      { 
        _id: { $in: studentIds },
        status: 'pending' 
      },
      {
        status: 'approved',
        approvedBy: adminId,
        approvedAt: new Date()
      }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} students approved successfully`,
      data: { approvedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Error bulk approving students:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get student approval statistics
router.get('/admin/students/approval-stats', async (req, res) => {
  try {
    const stats = await Student.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const pendingByYear = await Student.aggregate([
      {
        $match: { status: 'pending' }
      },
      {
        $group: {
          _id: '$currentYear',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        overallStats: stats,
        pendingByYear: pendingByYear
      }
    });
  } catch (error) {
    console.error('Error fetching approval stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});


// Additional routes to add to your existing admin routes

// Get dashboard stats including pending approvals
router.get('/admin/dashboard/stats', async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments();
    const pendingApprovals = await Student.countDocuments({ status: 'pending' });
    const approvedStudents = await Student.countDocuments({ status: 'approved' });
    const rejectedStudents = await Student.countDocuments({ status: 'rejected' });
    
    // Get pending students by currentYear
    const pendingByYear = await Student.aggregate([
      { $match: { status: 'pending' } },
      {
        $group: {
          _id: '$currentYear',
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Recent pending registrations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentPending = await Student.countDocuments({
      status: 'pending',
      createdAt: { $gte: sevenDaysAgo }
    });

    res.json({
      success: true,
      data: {
        overview: {
          totalStudents,
          pendingApprovals,
          approvedStudents,
          rejectedStudents,
          recentPending
        },
        pendingByYear,
        approvalRate: totalStudents > 0 ? ((approvedStudents / totalStudents) * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get detailed pending students with pagination
router.get('/admin/students/pending/detailed', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      currentYear,
      search 
    } = req.query;

    // Build filter
    const filter = { status: 'pending' };
    
    if (currentYear) {
      filter.currentYear = currentYear;
    }
    
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { rollNo: new RegExp(search, 'i') },
        { branch: new RegExp(search, 'i') },
        { college: new RegExp(search, 'i') }
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const pendingStudents = await Student.find(filter)
      .select('-password -otp -otpExpiry')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalCount = await Student.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);

    // Add time since registration for each student
    const studentsWithDuration = pendingStudents.map(student => ({
      ...student,
      daysSinceRegistration: Math.floor((new Date() - new Date(student.createdAt)) / (1000 * 60 * 60 * 24)),
      formattedCreatedAt: new Date(student.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }));

    res.json({
      success: true,
      data: {
        students: studentsWithDuration,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalCount,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
          limit: limitNum
        },
        filters: {
          currentYear,
          search,
          sortBy,
          sortOrder
        }
      }
    });
  } catch (error) {
    console.error('Error fetching detailed pending students:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Approve student with notification
router.patch('/admin/students/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { adminId, notificationMessage } = req.body;

    // Validate student exists and is pending
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    if (student.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Student is not in pending status. Current status: ${student.status}`
      });
    }

    // Update student status
    const updatedStudent = await Student.findByIdAndUpdate(
      id,
      {
        status: 'approved',
        approvedBy: adminId,
        approvedAt: new Date(),
        rejectionReason: null // Clear any previous rejection reason
      },
      { new: true, runValidators: true }
    ).select('-password');

    // Log the approval
    console.log('Student approved:', {
      studentId: id,
      studentName: updatedStudent.name,
      studentEmail: updatedStudent.email,
      approvedBy: adminId,
      approvedAt: updatedStudent.approvedAt
    });

    // TODO: Send email notification to student about approval
    // You can implement email notification here

    res.json({
      success: true,
      message: 'Student approved successfully',
      data: { 
        student: updatedStudent,
        notificationSent: false // Set to true when email notification is implemented
      }
    });
  } catch (error) {
    console.error('Error approving student:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Reject student with detailed reason
router.patch('/admin/students/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, adminId, detailedReason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    if (student.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Student is not in pending status. Current status: ${student.status}`
      });
    }

    const fullReason = detailedReason ? `${reason}. ${detailedReason}` : reason;

    const updatedStudent = await Student.findByIdAndUpdate(
      id,
      {
        status: 'rejected',
        rejectionReason: fullReason,
        approvedBy: adminId, // Track who rejected
        approvedAt: new Date() // Track when rejected
      },
      { new: true, runValidators: true }
    ).select('-password');

    // Log the rejection
    console.log('Student rejected:', {
      studentId: id,
      studentName: updatedStudent.name,
      studentEmail: updatedStudent.email,
      rejectedBy: adminId,
      rejectionReason: fullReason,
      rejectedAt: updatedStudent.approvedAt
    });

    // TODO: Send email notification to student about rejection
    // You can implement email notification here

    res.json({
      success: true,
      message: 'Student rejected successfully',
      data: { 
        student: updatedStudent,
        notificationSent: false // Set to true when email notification is implemented
      }
    });
  } catch (error) {
    console.error('Error rejecting student:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Reset student status (for re-review)
router.patch('/admin/students/:id/reset-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { adminId } = req.body;

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Only allow reset for rejected students
    if (student.status !== 'rejected') {
      return res.status(400).json({
        success: false,
        message: 'Can only reset status for rejected students'
      });
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      id,
      {
        status: 'pending',
        rejectionReason: null,
        approvedBy: null,
        approvedAt: null
      },
      { new: true, runValidators: true }
    ).select('-password');

    console.log('Student status reset to pending:', {
      studentId: id,
      studentName: updatedStudent.name,
      resetBy: adminId
    });

    res.json({
      success: true,
      message: 'Student status reset to pending for re-review',
      data: { student: updatedStudent }
    });
  } catch (error) {
    console.error('Error resetting student status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Get approval history/activity log
router.get('/admin/approval-activity', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, days = 30 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build date filter
    const dateFilter = new Date();
    dateFilter.setDate(dateFilter.getDate() - parseInt(days));

    // Build match filter
    const matchFilter = {
      approvedAt: { $gte: dateFilter },
      status: { $in: ['approved', 'rejected'] }
    };

    if (status && ['approved', 'rejected'].includes(status)) {
      matchFilter.status = status;
    }

    const activities = await Student.find(matchFilter)
      .select('name email currentYear branch college status rejectionReason approvedBy approvedAt')
      .populate({ path: 'approvedBy', select: 'name email', strictPopulate: false }) // <-- Fix: allow population even if not in schema
      .sort({ approvedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const totalCount = await Student.countDocuments(matchFilter);
    const totalPages = Math.ceil(totalCount / limitNum);

    // Format activities with readable dates
    const formattedActivities = activities.map(activity => ({
      ...activity,
      formattedDate: new Date(activity.approvedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      actionType: activity.status === 'approved' ? 'Approved' : 'Rejected',
      adminName: activity.approvedBy ? activity.approvedBy.name : 'Unknown Admin'
    }));

    res.json({
      success: true,
      data: {
        activities: formattedActivities,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalCount,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
          limit: limitNum
        },
        filters: {
          status,
          days: parseInt(days)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching approval activity:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});
module.exports = router;