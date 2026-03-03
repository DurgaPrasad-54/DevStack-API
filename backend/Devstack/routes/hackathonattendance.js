// routes/hackathonAttendance.routes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const HackathonAttendance = require('../Models/hackathonattendance');
const HackRegister = require('../Models/hack-reg');
const { Student } = require('../../models/roles');
const Hackathon = require('../Models/HackathonAdmin');
const { authenticateToken, requireRole, normalizeUser } = require('../../middleware/auth');

// Helper: is valid ObjectId
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Resolve registration id and student id given an input id
async function resolveRegistrationAndStudent(hackathonId, inputId) {
  if (!isValidId(inputId)) return null;

  // Try registration subdoc id first
  const hackReg = await HackRegister.findOne({ 
    hackathon: hackathonId, 
    'students._id': inputId 
  }).populate('students.student');
  
  if (hackReg) {
    const regEntry = hackReg.students.id(inputId);
    if (regEntry && regEntry.student) {
      return { 
        registrationId: regEntry._id, 
        studentId: regEntry.student._id, 
        studentData: regEntry.student 
      };
    }
  }

  // Try student id inside registrations
  const hackReg2 = await HackRegister.findOne({ 
    hackathon: hackathonId, 
    'students.student': inputId 
  }).populate('students.student');
  
  if (hackReg2) {
    const regEntry = hackReg2.students.find(s => 
      s.student && s.student._id.toString() === inputId.toString()
    );
    if (regEntry && regEntry.student) {
      return { 
        registrationId: regEntry._id, 
        studentId: regEntry.student._id, 
        studentData: regEntry.student 
      };
    }
  }

  return null;
}

// Apply authentication and normalization
router.use(authenticateToken);
router.use(normalizeUser);

// ==================== CREATE A SESSION (BY BRANCH) ====================
/**
 * POST /api/hackathonattendance/hackathon/:hackathonId/sessions
 * Body: { name: 'Session Name', branch: 'CSE', year: '3' }
 * Creates a session for a specific branch
 * Access: Coordinator/Admin
 */
router.post('/hackathon/:hackathonId/sessions', requireRole(['coordinator', 'admin']), async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const { name, branch, year } = req.body;

    console.log('Creating session:', { hackathonId, name, branch, year });

    // Validate required fields
    if (!isValidId(hackathonId) || !name || !branch) {
      return res.status(400).json({
        success: false,
        message: 'Valid hackathonId, branch, and session name are required',
        code: 'INVALID_INPUT'
      });
    }

    // Verify hackathon exists
    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hackathon not found', 
        code: 'HACKATHON_NOT_FOUND' 
      });
    }

    // Find existing attendance document for this branch
    let attendanceDoc = await HackathonAttendance.findOne({ 
      hackathon: hackathonId,
      branch: branch.trim()
    }).setOptions({ skipPopulate: true });

    // Check if session already exists BEFORE creating document
    if (attendanceDoc) {
      const existingSession = attendanceDoc.sessions.find(
        s => s.name.toLowerCase().trim() === name.trim().toLowerCase()
      );
      
      if (existingSession) {
        console.log('Session already exists:', name);
        return res.status(409).json({ 
          success: false, 
          message: `Session "${name}" already exists for ${branch}`, 
          code: 'SESSION_EXISTS',
          data: {
            branch: attendanceDoc.branch,
            existingSession: existingSession.name
          }
        });
      }

      // Add session to existing document
      attendanceDoc.sessions.push({ name: name.trim(), students: [] });
      await attendanceDoc.save();
      
      console.log('Session added to existing document');
    } else {
      // Create new document with first session
      console.log('Creating new attendance document with session');
      attendanceDoc = new HackathonAttendance({ 
        hackathon: hackathonId,
        branch: branch.trim(),
        year: year ? year.trim() : undefined,
        sessions: [{ name: name.trim(), students: [] }]
      });
      
      await attendanceDoc.save();
      console.log('New document created successfully');
    }

    res.status(201).json({ 
      success: true, 
      message: 'Session created successfully', 
      data: { 
        branch: attendanceDoc.branch,
        year: attendanceDoc.year,
        sessions: attendanceDoc.sessions.map(s => ({ 
          name: s.name,
          studentCount: s.students ? s.students.length : 0
        }))
      }
    });
  } catch (error) {
    console.error('Error creating session:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({ 
        success: false, 
        message: 'A session creation conflict occurred. Please try again.', 
        code: 'DUPLICATE_KEY' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create session', 
      code: 'SERVER_ERROR',
      error: error.message 
    });
  }
});

// ==================== GET SESSIONS FOR HACKATHON ====================
/**
 * GET /api/hackathonattendance/hackathon/:hackathonId/sessions
 * Query params: branch (optional)
 * Returns all sessions grouped by branch
 * Access: Authenticated users
 */
router.get('/hackathon/:hackathonId/sessions', async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const { branch } = req.query;

    if (!isValidId(hackathonId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid hackathon ID', 
        code: 'INVALID_ID' 
      });
    }

    // Build filter
    const filter = { hackathon: hackathonId };
    if (branch) filter.branch = branch.trim();

    // Find attendance documents without populate
    const attendanceDocs = await HackathonAttendance.find(filter)
      .select('branch year sessions')
      .setOptions({ skipPopulate: true })
      .lean();

    // Format response
    const branchSessions = attendanceDocs.map(doc => ({
      branch: doc.branch,
      year: doc.year,
      sessions: (doc.sessions || []).map(s => ({
        name: s.name,
        hasData: Array.isArray(s.students) && s.students.length > 0,
        studentCount: Array.isArray(s.students) ? s.students.length : 0
      }))
    }));

    res.status(200).json({ 
      success: true, 
      data: { branches: branchSessions },
      message: branchSessions.length === 0 ? 'No sessions found' : undefined
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch sessions', 
      code: 'SERVER_ERROR',
      error: error.message 
    });
  }
});

// ==================== MARK ATTENDANCE (BRANCH-SPECIFIC) ====================
/**
 * POST /api/hackathonattendance/mark
 * Body: { 
 *   hackathonId, 
 *   sessionName, 
 *   branch, 
 *   year, 
 *   attendanceRecords: [{ studentId, status, remarks }] 
 * }
 * Marks attendance for students in a specific branch
 * Access: Coordinator/Admin
 */
router.post('/mark', requireRole(['coordinator', 'admin']), async (req, res) => {
  try {
    const { hackathonId, sessionName, branch, year, attendanceRecords } = req.body;

    console.log('Marking attendance:', { 
      hackathonId, 
      sessionName, 
      branch, 
      recordCount: attendanceRecords?.length 
    });

    // Validate required fields
    if (!hackathonId || !sessionName || !branch || !Array.isArray(attendanceRecords)) {
      return res.status(400).json({ 
        success: false, 
        message: 'hackathonId, sessionName, branch, and attendanceRecords are required', 
        code: 'INVALID_INPUT' 
      });
    }

    if (!isValidId(hackathonId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid hackathon ID', 
        code: 'INVALID_ID' 
      });
    }

    // Verify hackathon exists
    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hackathon not found', 
        code: 'HACKATHON_NOT_FOUND' 
      });
    }

    // Find or create attendance document for this branch
    let attendanceDoc = await HackathonAttendance.findOne({ 
      hackathon: hackathonId,
      branch: branch.trim()
    }).setOptions({ skipPopulate: true });

    if (!attendanceDoc) {
      console.log('Creating new attendance document for marking');
      attendanceDoc = new HackathonAttendance({
        hackathon: hackathonId,
        branch: branch.trim(),
        year: year ? year.trim() : undefined,
        sessions: []
      });
    }

    // Find or create session
    let sessionDoc = attendanceDoc.sessions.find(s => s.name === sessionName);
    if (!sessionDoc) {
      console.log('Creating new session:', sessionName);
      attendanceDoc.sessions.push({ name: sessionName, students: [] });
      sessionDoc = attendanceDoc.sessions[attendanceDoc.sessions.length - 1];
    }

    if (!sessionDoc.students) sessionDoc.students = [];

    // Process attendance records
    const results = { created: 0, updated: 0, failed: 0, errors: [] };

    for (const record of attendanceRecords) {
      try {
        const { studentId, status = 'present', remarks = '' } = record;

        if (!studentId) {
          results.failed++;
          results.errors.push({ studentId: 'undefined', reason: 'Student ID is required' });
          continue;
        }

        // Resolve student registration
        const resolved = await resolveRegistrationAndStudent(hackathonId, studentId);
        if (!resolved) {
          results.failed++;
          results.errors.push({ 
            studentId, 
            reason: 'Student not registered for this hackathon' 
          });
          continue;
        }

        // Verify student belongs to this branch
        const studentData = await Student.findById(resolved.studentId)
          .select('branch name email');
        
        if (!studentData) {
          results.failed++;
          results.errors.push({ 
            studentId, 
            reason: 'Student not found in database' 
          });
          continue;
        }

        // Check branch match (case-insensitive comparison)
        const studentBranch = (studentData.branch || '').trim().toLowerCase();
        const targetBranch = branch.trim().toLowerCase();

        if (studentBranch !== targetBranch) {
          results.failed++;
          results.errors.push({ 
            studentId, 
            reason: `Student belongs to ${studentData.branch || 'unknown'}, not ${branch}` 
          });
          continue;
        }

        // Check if attendance already exists
        const existingIndex = sessionDoc.students.findIndex(st => 
          st.student && st.student.toString() === resolved.studentId.toString()
        );

        if (existingIndex >= 0) {
          // Update existing attendance
          sessionDoc.students[existingIndex].status = status;
          sessionDoc.students[existingIndex].checkInTime = 
            (status === 'present' || status === 'late') ? new Date() : null;
          if (remarks) sessionDoc.students[existingIndex].remarks = remarks;
          results.updated++;
        } else {
          // Create new attendance record
          sessionDoc.students.push({
            registrationId: resolved.registrationId,
            student: resolved.studentId,
            status,
            checkInTime: (status === 'present' || status === 'late') ? new Date() : null,
            remarks
          });
          results.created++;
        }
      } catch (err) {
        console.error('Error processing record:', err);
        results.failed++;
        results.errors.push({ 
          studentId: record.studentId, 
          reason: err.message 
        });
      }
    }

    // Save attendance document
    try {
      await attendanceDoc.save();
      console.log('Attendance saved successfully:', results);
    } catch (saveError) {
      console.error('Error saving attendance:', saveError);
      return res.status(500).json({
        success: false,
        message: 'Failed to save attendance data',
        code: 'SAVE_ERROR',
        error: saveError.message
      });
    }

    res.status(200).json({
      success: true,
      message: 'Attendance processed successfully',
      data: results
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark attendance', 
      code: 'SERVER_ERROR', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ==================== GET ATTENDANCE FOR HACKATHON ====================
/**
 * GET /api/hackathonattendance/hackathon/:hackathonId
 * Query params: sessionName, branch (optional)
 * Returns attendance data grouped by branches
 * Access: Authenticated users
 */
router.get('/hackathon/:hackathonId', async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const { sessionName, branch } = req.query;

    if (!isValidId(hackathonId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid hackathon ID', 
        code: 'INVALID_ID' 
      });
    }

    // Verify hackathon exists
    const hackathon = await Hackathon.findById(hackathonId)
      .select('hackathonname name startdate enddate venue')
      .lean();
    
    if (!hackathon) {
      return res.status(404).json({ 
        success: false, 
        message: 'Hackathon not found', 
        code: 'HACKATHON_NOT_FOUND' 
      });
    }

    // Build filter
    const filter = { hackathon: hackathonId };
    if (branch) filter.branch = branch.trim();

    // Fetch attendance documents
    const attendanceDocs = await HackathonAttendance.find(filter)
      .populate({ 
        path: 'sessions.students.student', 
        select: 'name email rollNo branch college year' 
      })
      .lean();

    if (!attendanceDocs || attendanceDocs.length === 0) {
      return res.status(200).json({ 
        success: true, 
        data: { hackathon, branches: [] }, 
        message: 'No attendance records found' 
      });
    }

    // Format branch data with statistics
    const branchData = attendanceDocs.map(doc => {
      let sessions = doc.sessions || [];
      if (sessionName) {
        sessions = sessions.filter(s => s.name === sessionName);
      }

      const sessionStats = sessions.map(sess => {
        const total = (sess.students || []).length;
        const present = (sess.students || []).filter(s => s.status === 'present').length;
        const absent = (sess.students || []).filter(s => s.status === 'absent').length;
        const late = (sess.students || []).filter(s => s.status === 'late').length;
        const excused = (sess.students || []).filter(s => s.status === 'excused').length;

        return {
          session: sess.name,
          students: sess.students,
          statistics: { 
            total, 
            present, 
            absent, 
            late, 
            excused, 
            attendanceRate: total > 0 ? ((present + late) / total * 100).toFixed(2) : '0.00'
          }
        };
      });

      return {
        branch: doc.branch,
        year: doc.year,
        sessions: sessionStats
      };
    });

    res.status(200).json({ 
      success: true, 
      data: { hackathon, branches: branchData } 
    });
  } catch (error) {
    console.error('Error fetching hackathon attendance:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch attendance', 
      code: 'SERVER_ERROR' 
    });
  }
});

// ==================== GET STUDENT ATTENDANCE HISTORY ====================
router.get('/student/:studentId/history', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { hackathonId } = req.query;

    if (req.user.role === 'student' && studentId !== req.user.userId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied', 
        code: 'ACCESS_DENIED' 
      });
    }

    if (!isValidId(studentId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid student ID', 
        code: 'INVALID_ID' 
      });
    }

    const filter = {};
    if (hackathonId) {
      if (!isValidId(hackathonId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid hackathon ID', 
          code: 'INVALID_ID' 
        });
      }
      filter.hackathon = hackathonId;
    }

    const attendanceDocs = await HackathonAttendance.find(filter)
      .populate('hackathon', 'name hackathonname startdate enddate venue')
      .lean();

    const student = await Student.findById(studentId)
      .select('name email rollNo branch college year');
    
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found', 
        code: 'STUDENT_NOT_FOUND' 
      });
    }

    const attendanceHistory = [];
    let totalPresent = 0, totalAbsent = 0, totalLate = 0, totalExcused = 0;

    attendanceDocs.forEach(doc => {
      doc.sessions.forEach(session => {
        const studentAttendance = session.students.find(
          s => s.student.toString() === studentId
        );
        
        if (studentAttendance) {
          attendanceHistory.push({
            hackathon: doc.hackathon,
            branch: doc.branch,
            session: session.name,
            status: studentAttendance.status,
            checkInTime: studentAttendance.checkInTime,
            remarks: studentAttendance.remarks
          });

          if (studentAttendance.status === 'present') totalPresent++;
          else if (studentAttendance.status === 'absent') totalAbsent++;
          else if (studentAttendance.status === 'late') totalLate++;
          else if (studentAttendance.status === 'excused') totalExcused++;
        }
      });
    });

    const totalSessions = attendanceHistory.length;
    const attendanceRate = totalSessions > 0 
      ? ((totalPresent + totalLate) / totalSessions * 100).toFixed(2) 
      : '0.00';

    res.status(200).json({
      success: true,
      data: {
        student,
        attendance: attendanceHistory,
        statistics: { 
          totalSessions, 
          present: totalPresent, 
          absent: totalAbsent, 
          late: totalLate, 
          excused: totalExcused, 
          attendanceRate 
        }
      }
    });
  } catch (error) {
    console.error('Error fetching student attendance history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch attendance history', 
      code: 'SERVER_ERROR' 
    });
  }
});

// ==================== UPDATE ATTENDANCE ====================
router.put('/update', requireRole(['coordinator', 'admin']), async (req, res) => {
  try {
    const { hackathonId, sessionName, branch, studentId, status, remarks } = req.body;

    if (!hackathonId || !sessionName || !branch || !studentId) {
      return res.status(400).json({ 
        success: false,
        message: 'hackathonId, sessionName, branch, and studentId are required',
        code: 'INVALID_INPUT'
      });
    }

    const attendanceDoc = await HackathonAttendance.findOne({ 
      hackathon: hackathonId,
      branch: branch.trim()
    });

    if (!attendanceDoc) {
      return res.status(404).json({ 
        success: false, 
        message: 'Attendance record not found for this branch', 
        code: 'NOT_FOUND' 
      });
    }

    const sessionDoc = attendanceDoc.sessions.find(s => s.name === sessionName);
    if (!sessionDoc) {
      return res.status(404).json({ 
        success: false, 
        message: 'Session not found', 
        code: 'SESSION_NOT_FOUND' 
      });
    }

    const studentIndex = sessionDoc.students.findIndex(
      s => s.student.toString() === studentId
    );

    if (studentIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student attendance not found in this session', 
        code: 'STUDENT_NOT_FOUND' 
      });
    }

    if (status) sessionDoc.students[studentIndex].status = status;
    if (remarks !== undefined) sessionDoc.students[studentIndex].remarks = remarks;
    if (status === 'present' || status === 'late') {
      sessionDoc.students[studentIndex].checkInTime = new Date();
    }

    await attendanceDoc.save();

    res.status(200).json({
      success: true,
      message: 'Attendance updated successfully',
      data: sessionDoc.students[studentIndex]
    });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update attendance', 
      code: 'SERVER_ERROR' 
    });
  }
});

// ==================== DELETE SESSION ====================
router.delete('/session', requireRole(['admin']), async (req, res) => {
  try {
    const { hackathonId, sessionName, branch } = req.body;

    if (!hackathonId || !sessionName || !branch) {
      return res.status(400).json({ 
        success: false,
        message: 'hackathonId, sessionName, and branch are required',
        code: 'INVALID_INPUT'
      });
    }

    const attendanceDoc = await HackathonAttendance.findOne({ 
      hackathon: hackathonId,
      branch: branch.trim()
    });

    if (!attendanceDoc) {
      return res.status(404).json({ 
        success: false, 
        message: 'Attendance record not found', 
        code: 'NOT_FOUND' 
      });
    }

    const initialLength = attendanceDoc.sessions.length;
    attendanceDoc.sessions = attendanceDoc.sessions.filter(s => s.name !== sessionName);

    if (attendanceDoc.sessions.length === initialLength) {
      return res.status(404).json({ 
        success: false, 
        message: 'Session not found', 
        code: 'SESSION_NOT_FOUND' 
      });
    }

    await attendanceDoc.save();

    res.status(200).json({ 
      success: true, 
      message: 'Session deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete session', 
      code: 'SERVER_ERROR' 
    });
  }
});

module.exports = router;