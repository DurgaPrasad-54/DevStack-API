const express = require('express');
const router = express.Router();
const { Student, Admin } = require('../models/roles');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ADMIN_USER,
    pass: process.env.ADMIN_PASS
  }
});

// Route for student to request year change to "second year"
router.post('/student/request-year-change', async (req, res) => {
  try {
    const { studentId, requestedYear = 'second year', reason } = req.body;
    
    // Validate input
    if (!studentId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Student ID is required' 
      });
    }

    // Find the student
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    // Check if student is already in second year or higher
    const yearOrder = ['first year', 'second year', 'third year', 'fourth year', 'alumni'];
    const currentYearIndex = yearOrder.indexOf(student.currentYear);
    const requestedYearIndex = yearOrder.indexOf(requestedYear);

    if (currentYearIndex >= requestedYearIndex) {
      return res.status(400).json({ 
        success: false, 
        message: `You are already in ${student.currentYear}. Cannot request change to ${requestedYear}` 
      });
    }

    // Check if student already has a pending request
    if (student.yearChangeRequest && student.yearChangeRequest.status === 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: 'You already have a pending year change request' 
      });
    }

    // Create year change request
    student.yearChangeRequest = {
      requestedYear: requestedYear,
      requestedAt: new Date(),
      status: 'pending',
      reason: reason || 'Student requested promotion to second year',
      adminResponse: null,
      processedAt: null,
      processedBy: null
    };

    await student.save();

    // Notify admins about the new request (optional)
    try {
      const admins = await Admin.find({}, 'email');
      const adminEmails = admins.map(admin => admin.email);
      
      if (adminEmails.length > 0) {
        await transporter.sendMail({
          from: process.env.ADMIN_USER,
          to: adminEmails,
          subject: 'New Year Change Request',
          text: `Student ${student.name} (${student.email}) has requested to change from ${student.currentYear} to ${requestedYear}.\n\nReason: ${reason || 'No reason provided'}\n\nPlease review this request in the admin panel.`
        });
      }
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: 'Year change request submitted successfully. You will be notified once an admin reviews your request.',
      data: {
        requestId: student._id,
        requestedYear: requestedYear,
        currentYear: student.currentYear,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Error submitting year change request:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Route to get all pending year change requests (Admin only)
router.get('/admin/year-change-requests', async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;

    // Build filter
    const filter = {};
    if (status !== 'all') {
      filter['yearChangeRequest.status'] = status;
    }
    filter.yearChangeRequest = { $exists: true };

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get students with year change requests
    const students = await Student.find(filter)
      .select('name email phoneNumber rollNo branch currentYear college yearChangeRequest')
      .sort({ 'yearChangeRequest.requestedAt': -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count
    const totalCount = await Student.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);

    // Format the response
    const requests = students.map(student => ({
      studentId: student._id,
      studentInfo: {
        name: student.name,
        email: student.email,
        phoneNumber: student.phoneNumber,
        rollNo: student.rollNo,
        branch: student.branch,
        college: student.college,
        currentYear: student.currentYear
      },
      request: student.yearChangeRequest
    }));

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalCount,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
          limit: limitNum
        }
      }
    });

  } catch (error) {
    console.error('Error fetching year change requests:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Route to approve/reject individual year change request
router.patch('/admin/year-change-request/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { action, adminId, adminResponse } = req.body; // action: 'approve' or 'reject'

    // Validate input
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Action must be either "approve" or "reject"' 
      });
    }

    // Find the student
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    // Check if student has a pending request
    if (!student.yearChangeRequest || student.yearChangeRequest.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        message: 'No pending year change request found for this student' 
      });
    }

    // Store the requested year before processing
    const requestedYear = student.yearChangeRequest.requestedYear;
    
    // Ensure currentYear is not undefined - fallback to existing value
    if (!student.currentYear) {
      student.currentYear = 'first year'; // Default fallback
    }

    // Process the request
    if (action === 'approve') {
      // Validate that requestedYear exists
      if (!requestedYear) {
        return res.status(400).json({ 
          success: false, 
          message: 'Requested year is missing from the request' 
        });
      }

      // Update student's current year only if approving
      student.currentYear = requestedYear;
      
      // If moving to second year, also update the numeric year field
      if (requestedYear === 'second year') {
        const currentYearNum = parseInt(student.year) || 1;
        student.year = (currentYearNum + 1).toString();
      }
      
      // Set approval status
      student.status = 'approved';
      student.approvedAt = new Date();
      if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
        student.approvedBy = adminId;
      }
    } else {
      // For rejection, keep the current year unchanged
      // Just ensure it's not undefined
      if (!student.currentYear) {
        student.currentYear = 'first year';
      }
    }

    // Update request status
    student.yearChangeRequest.status = action === 'approve' ? 'approved' : 'rejected';
    student.yearChangeRequest.processedAt = new Date();

    // Only set processedBy if adminId is a valid ObjectId
    if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
      student.yearChangeRequest.processedBy = adminId;
    }

    student.yearChangeRequest.adminResponse = adminResponse || `Request ${action}d by admin`;

    // Save with validation
    await student.save();

    // Send notification email to student
    try {
      const emailSubject = action === 'approve' ? 'Year Change Request Approved' : 'Year Change Request Rejected';
      const emailText = action === 'approve' 
        ? `Good news! Your request to change to ${requestedYear} has been approved. Your current year is now ${student.currentYear}.`
        : `Your request to change to ${requestedYear} has been rejected. Reason: ${adminResponse || 'No reason provided'}`;

      await transporter.sendMail({
        from: process.env.ADMIN_USER,
        to: student.email,
        subject: emailSubject,
        text: emailText
      });
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
    }

    res.json({
      success: true,
      message: `Year change request ${action}d successfully`,
      data: {
        studentId: student._id,
        studentName: student.name,
        action: action,
        requestedYear: requestedYear,
        newCurrentYear: student.currentYear,
        processedAt: student.yearChangeRequest.processedAt
      }
    });

  } catch (error) {
    console.error('Error processing year change request:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


// Route to bulk approve all pending year change requests
router.patch('/admin/bulk-approve-year-changes', async (req, res) => {
  try {
    const { adminId, adminResponse = 'Bulk approved by admin' } = req.body;

    // Find all students with pending year change requests
    const studentsWithPendingRequests = await Student.find({
      'yearChangeRequest.status': 'pending'
    });

    if (studentsWithPendingRequests.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No pending year change requests found' 
      });
    }

    const results = [];
    const errors = [];

    // Process each request
    for (const student of studentsWithPendingRequests) {
      try {
        const requestedYear = student.yearChangeRequest.requestedYear;

        // Ensure requestedYear is present
        if (!requestedYear) {
          errors.push({
            studentId: student._id,
            studentName: student.name,
            error: 'Requested year is missing in yearChangeRequest'
          });
          continue;
        }

        // Update student's current year
        student.currentYear = requestedYear;

        // If moving to second year, also update the year field
        if (requestedYear === 'second year') {
          const currentYearNum = parseInt(student.year);
          student.year = (currentYearNum + 1).toString();
        }

        // Update request status
        student.yearChangeRequest.status = 'approved';
        student.yearChangeRequest.processedAt = new Date();
        if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
          student.yearChangeRequest.processedBy = adminId;
        } else {
          student.yearChangeRequest.processedBy = undefined;
        }
        student.yearChangeRequest.adminResponse = adminResponse;

        await student.save();

        results.push({
          studentId: student._id,
          studentName: student.name,
          studentEmail: student.email,
          fromYear: student.yearChangeRequest.requestedYear === 'second year' ? 'first year' : 'unknown',
          toYear: student.currentYear,
          newYear: student.year
        });

        // Send notification email
        try {
          await transporter.sendMail({
            from: process.env.ADMIN_USER,
            to: student.email,
            subject: 'Year Change Request Approved',
            text: `Good news! Your request to change to ${requestedYear} has been approved. Your current year is now ${student.currentYear}.`
          });
        } catch (emailError) {
          console.error(`Failed to send email to ${student.email}:`, emailError);
        }

      } catch (err) {
        errors.push({
          studentId: student._id,
          studentName: student.name,
          error: err.message
        });
      }
    }

    res.json({
      success: true,
      message: `Bulk approval completed. ${results.length} requests approved, ${errors.length} errors.`,
      data: {
        totalRequests: studentsWithPendingRequests.length,
        approved: results,
        errors: errors
      }
    });

  } catch (error) {
    console.error('Error in bulk approval:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// Route to bulk reject all pending year change requests
router.patch('/admin/bulk-reject-year-changes', async (req, res) => {
  try {
    const { adminId, adminResponse = 'Bulk rejected by admin' } = req.body;

    // Find all students with pending year change requests
    const studentsWithPendingRequests = await Student.find({
      'yearChangeRequest.status': 'pending'
    });

    if (studentsWithPendingRequests.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No pending year change requests found' 
      });
    }

    const results = [];
    const errors = [];

    // Process each request
    for (const student of studentsWithPendingRequests) {
      try {
        // Ensure currentYear is set (fallback to first year if missing)
        if (!student.currentYear) {
          student.currentYear = 'first year';
        }

        // Update request status
        student.yearChangeRequest.status = 'rejected';
        student.yearChangeRequest.processedAt = new Date();
        if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
          student.yearChangeRequest.processedBy = adminId;
        }
        student.yearChangeRequest.adminResponse = adminResponse;

        await student.save();

        results.push({
          studentId: student._id,
          studentName: student.name,
          studentEmail: student.email,
          requestedYear: student.yearChangeRequest.requestedYear,
          currentYear: student.currentYear
        });

        // Send notification email
        try {
          await transporter.sendMail({
            from: process.env.ADMIN_USER,
            to: student.email,
            subject: 'Year Change Request Rejected',
            text: `Your request to change to ${student.yearChangeRequest.requestedYear} has been rejected. Reason: ${adminResponse}`
          });
        } catch (emailError) {
          console.error(`Failed to send email to ${student.email}:`, emailError);
        }

      } catch (err) {
        errors.push({
          studentId: student._id,
          studentName: student.name,
          error: err.message
        });
      }
    }

    res.json({
      success: true,
      message: `Bulk rejection completed. ${results.length} requests rejected, ${errors.length} errors.`,
      data: {
        totalRequests: studentsWithPendingRequests.length,
        rejected: results,
        errors: errors
      }
    });

  } catch (error) {
    console.error('Error in bulk rejection:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Route to get student's own year change request status
router.get('/student/year-change-status/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findById(studentId)
      .select('name currentYear yearChangeRequest')
      .lean();

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    res.json({
      success: true,
      data: {
        studentName: student.name,
        currentYear: student.currentYear,
        hasRequest: !!student.yearChangeRequest,
        request: student.yearChangeRequest || null
      }
    });

  } catch (error) {
    console.error('Error fetching year change status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

module.exports = router;