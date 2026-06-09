const express = require("express");
const router = express.Router();
const HackRegister = require("../Models/hack-reg");
const { Student } = require("../../models/roles");
const Hackathon = require("../Models/HackathonAdmin");
const { authenticateToken } = require("../../middleware/auth");
const { uploadReceipt, getReceipt, deleteReceipt } = require("../Models/gridfs");
const mongoose = require("mongoose");
const { logger } = require("../../utils/logger");
const { calculateStatus } = require("../utils/hackathonUtils");

// 1️⃣ Get student's ongoing approved hackathon
router.get("/student/:studentId/ongoing-approved", async (req, res) => {
  try {
    const { studentId } = req.params;
    const studentObjectId = new mongoose.Types.ObjectId(studentId);

    logger.info("Checking ongoing hackathon for student", { studentId: studentObjectId });

    // Find registrations where student is approved
    const approvedRegs = await HackRegister.find({
      "students.student": studentObjectId,
      "students.status": "approved",
    }).populate("hackathon");

    logger.debug("Approved registrations found", { count: approvedRegs.length });

    if (!approvedRegs.length) {
      return res.status(200).json({ hackathon: null });
    }

    // Extract hackathons from approved registrations
    const approvedHackathons = approvedRegs.map((r) => r.hackathon);

    // Find one that is ongoing
    const ongoingHackathon = approvedHackathons.find(
      (h) => h && h.status === "ongoing"
    );

    if (!ongoingHackathon) {
      logger.debug("No ongoing hackathon found among approved ones.");
      return res.status(200).json({ hackathon: null });
    }

    logger.info("Found ongoing approved hackathon", { hackathonName: ongoingHackathon.hackathonname });
    res.status(200).json({ hackathon: ongoingHackathon });
  } catch (error) {
    logger.error("Error fetching ongoing approved hackathon", { error: error.message });
    res.status(500).json({ error: "Server error" });
  }
});

// 2️⃣ Generate UPI payment URL for QR code
router.post("/upi/generate", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    const upiId = process.env.PHONEPAY_UPI_ID || "9492113371@ybl";
    const payeeName = "Hackathon Registration";
    const transactionNote = "Hackathon Fee Payment";
    const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amount}&tn=${encodeURIComponent(transactionNote)}&cu=INR`;
    res.json({ upiUrl });
  } catch (err) {
    logger.error("Failed to generate UPI URL", { error: err.message });
    res.status(500).json({ error: "Failed to generate UPI URL" });
  }
});

// 3️⃣ Register students for a hackathon
router.post("/register", async (req, res) => {
  try {
    const { hackathonId, students } = req.body;
    if (!hackathonId || !students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: "Missing registration data" });
    }

    // Validate hackathon
    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({ error: "Hackathon not found" });
    }

    // Prepare students array
    const regStudents = [];
    const uploadedFileIds = []; // Track uploaded files for cleanup on error
    
    try {
      for (const s of students) {
        // Check if student already registered
        const existing = await HackRegister.findOne({
          hackathon: hackathonId,
          "students.student": s.studentId
        });
        
        if (existing) {
          // Cleanup uploaded files
          for (const fileId of uploadedFileIds) {
            await deleteReceipt(fileId).catch(err => logger.error("Cleanup error", { error: err.message }));
          }
          return res.status(400).json({ 
            error: `Student is already registered for this hackathon` 
          });
        }

        // Upload receipt to GridFS
        const buffer = Buffer.from(s.feeReceipt.data, "base64");
        const filename = `receipt_${s.transactionId}_${Date.now()}`;
        const fileId = await uploadReceipt(buffer, filename, s.feeReceipt.contentType);
        uploadedFileIds.push(fileId);

        regStudents.push({
          student: s.studentId,
          transactionId: s.transactionId,
          upiUtrNumber: s.upiUtrNumber,
          feeReceiptFileId: fileId,
          feeReceiptContentType: s.feeReceipt.contentType,
          status: "pending"
        });
      }

      // Use findOneAndUpdate with upsert to add to existing or create new
      const registration = await HackRegister.findOneAndUpdate(
        { hackathon: hackathonId },
        { $push: { students: { $each: regStudents } } },
        { new: true, upsert: true }
      );

      res.status(201).json({ 
        message: "Registration successful", 
        registration 
      });
    } catch (uploadError) {
      // Cleanup uploaded files on error
      for (const fileId of uploadedFileIds) {
        await deleteReceipt(fileId).catch(err => logger.error("Cleanup error", { error: err.message }));
      }
      throw uploadError;
    }
  } catch (err) {
    logger.error("Error in registering", { error: err.message });
    res.status(500).json({ error: "Server error" });
  }
});

// 4️⃣ Get all hackathons for dropdown with filtering by college and year
router.get('/hackathons/all', async (req, res) => {
  try {
    const { year, college } = req.query;

    // Build filter object - hackathons with "All" college are visible to everyone
    let filter = {};
    if (year) filter.year = year;
    
    // If college is specified, show hackathons for that college PLUS "All" hackathons
    if (college) {
      filter.$or = [
        { college: college },      // Hackathons for specific college
        { college: 'All' }         // Hackathons for all colleges
      ];
    }

    // Fetch hackathons with lean() for better performance
    let hackathons = await Hackathon.find(filter).lean();

    // Calculate status for each hackathon in memory
    hackathons = hackathons.map(h => ({
      ...h,
      status: calculateStatus(h.regstart, h.enddate)
    }));

    res.json({
      success: true,
      hackathons: hackathons,
      count: hackathons.length,
      filters: {
        year: year || 'all',
        college: college || 'all'
      }
    });
  } catch (err) {
    logger.error("Error fetching hackathons", { error: err.message });
    res.status(500).json({ 
      success: false,
      error: "Server error"
    });
  }
});

// 5️⃣ Get all registered students for a specific hackathon with fee verification details
router.get("/hackathon/:hackathonId/students", async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const { status, coordinatorYear, coordinatorCollege } = req.query;

    if (!hackathonId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid hackathonId format" });
    }

    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({ error: "Hackathon not found" });
    }

    // Verify hackathon matches coordinator's year and college
    if (coordinatorYear && hackathon.year !== coordinatorYear) {
      return res.status(403).json({ 
        error: "You can only view hackathons for your year" 
      });
    }
    if (coordinatorCollege && hackathon.college !== coordinatorCollege) {
      return res.status(403).json({ 
        error: "You can only view hackathons for your college" 
      });
    }

    let query = { hackathon: hackathonId };
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      query["students.status"] = status;
    }

    const registrations = await HackRegister.find(query)
      .populate({
        path: "students.student",
        select: "name email rollNo department currentYear phone branch college"
      })
      .populate("hackathon", "hackathonname entryfee year college");

    const studentsData = [];
    registrations.forEach(registration => {
      registration.students.forEach(studentReg => {
        if (status && studentReg.status !== status) {
          return;
        }

        // Filter students by coordinator's year and college
        const student = studentReg.student;
        if (!student) return;

        if (coordinatorYear && student.currentYear !== coordinatorYear) {
          return;
        }
        if (coordinatorCollege && student.college !== coordinatorCollege) {
          return;
        }

        studentsData.push({
          registrationId: registration._id,
          studentRegId: studentReg._id,
          student: studentReg.student,
          hackathon: registration.hackathon,
          transactionId: studentReg.transactionId,
          upiUtrNumber: studentReg.upiUtrNumber,
          status: studentReg.status,
          registeredAt: studentReg.registeredAt,
          verifiedAt: studentReg.verifiedAt,
          verifiedBy: studentReg.verifiedBy ? { _id: studentReg.verifiedBy, name: 'Coordinator' } : null,
          remarks: studentReg.remarks,
          feeReceipt: {
            contentType: studentReg.feeReceiptContentType,
            hasReceipt: !!studentReg.feeReceiptFileId
          }
        });
      });
    });

    res.json({
      success: true,
      hackathon: {
        _id: hackathon._id,
        hackathonname: hackathon.hackathonname,
        entryfee: hackathon.entryfee,
        year: hackathon.year,
        college: hackathon.college
      },
      students: studentsData,
      totalCount: studentsData.length,
      statusCount: {
        pending: studentsData.filter(s => s.status === "pending").length,
        approved: studentsData.filter(s => s.status === "approved").length,
        rejected: studentsData.filter(s => s.status === "rejected").length
      }
    });
  } catch (err) {
    logger.error("Error fetching hackathon students", { error: err.message });
    res.status(500).json({ error: "Server error" });
  }
});

// 6️⃣ Update student fee verification status (Approve/Reject/Pending)
router.put("/student/:registrationId/:studentRegId/status", async (req, res) => {
  try {
    const { registrationId, studentRegId } = req.params;
    const { status, coordinatorId, remarks } = req.body;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be 'approved', 'rejected', or 'pending'" });
    }

    const updateFields = {
      "students.$.status": status,
      "students.$.verifiedAt": new Date(),
      "students.$.verifiedBy": coordinatorId,
      "students.$.remarks": remarks || ""
    };

    const registration = await HackRegister.findOneAndUpdate(
      { _id: registrationId, "students._id": studentRegId },
      { $set: updateFields },
      { new: true }
    )
    .populate([
      { path: "students.student", select: "name email rollNo department year" },
      { path: "hackathon", select: "hackathonname entryfee" }
    ]);

    if (!registration) {
      return res.status(404).json({ error: "Registration or student not found" });
    }

    const updatedStudent = registration.students.find(s => s._id.toString() === studentRegId);

    res.json({
      success: true,
      message: `Student status updated to ${status}`,
      student: {
        registrationId: registration._id,
        studentRegId: updatedStudent._id,
        student: updatedStudent.student,
        hackathon: registration.hackathon,
        transactionId: updatedStudent.transactionId,
        status: updatedStudent.status,
        verifiedAt: updatedStudent.verifiedAt,
        verifiedBy: updatedStudent.verifiedBy ? { _id: updatedStudent.verifiedBy, name: 'Coordinator' } : null,
        remarks: updatedStudent.remarks
      }
    });
  } catch (err) {
    logger.error("Error updating student status", { error: err.message });
    res.status(500).json({ error: "Server error" });
  }
});

// 7️⃣ Get fee receipt for a student
router.get("/receipt/:registrationId/:studentRegId", async (req, res) => {
  try {
    const { registrationId, studentRegId } = req.params;

    const registration = await HackRegister.findById(registrationId);
    if (!registration) {
      return res.status(404).json({ error: "Registration not found" });
    }

    const student = registration.students.find(s => s._id.toString() === studentRegId);
    if (!student || !student.feeReceiptFileId) {
      return res.status(404).json({ error: "Fee receipt not found" });
    }

    res.set({
      'Content-Type': student.feeReceiptContentType,
      'Content-Disposition': `inline; filename="receipt_${student.transactionId}.${student.feeReceiptContentType.split('/')[1]}"`
    });

    const downloadStream = await getReceipt(student.feeReceiptFileId);
    downloadStream.pipe(res);
  } catch (err) {
    logger.error("Error fetching receipt", { error: err.message });
    res.status(500).json({ error: "Server error" });
  }
});

// 8️⃣ Get statistics for a hackathon
router.get("/hackathon/:hackathonId/stats", async (req, res) => {
  try {
    const { hackathonId } = req.params;

    if (!hackathonId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid hackathonId format" });
    }

    const hackathon = await Hackathon.findById(hackathonId);
    if (!hackathon) {
      return res.status(404).json({ error: "Hackathon not found" });
    }

    const registrations = await HackRegister.find({ hackathon: hackathonId });

    let totalStudents = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    registrations.forEach(registration => {
      registration.students.forEach(student => {
        totalStudents++;
        switch (student.status) {
          case "pending": pendingCount++; break;
          case "approved": approvedCount++; break;
          case "rejected": rejectedCount++; break;
        }
      });
    });

    res.json({
      success: true,
      stats: {
        totalRegistrations: totalStudents,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        completionRate: totalStudents > 0 ? ((approvedCount + rejectedCount) / totalStudents * 100).toFixed(1) : 0
      }
    });
  } catch (err) {
    logger.error("Error fetching stats", { error: err.message });
    res.status(500).json({ error: "Server error" });
  }
});

// 9️⃣ Bulk update student statuses (OPTIMIZED with bulkWrite to prevent N+1 queries)
router.put("/hackathon/:hackathonId/bulk-update", async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const { updates, coordinatorId } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    const bulkOps = [];
    const invalidUpdates = [];

    for (const update of updates) {
      const { registrationId, studentRegId, status, remarks } = update;

      if (!registrationId || !studentRegId) {
        invalidUpdates.push({ update, error: "Missing registrationId or studentRegId" });
        continue;
      }

      if (!["approved", "rejected", "pending"].includes(status)) {
        invalidUpdates.push({ update, error: "Invalid status" });
        continue;
      }

      bulkOps.push({
        updateOne: {
          filter: { 
            _id: registrationId, 
            "students._id": studentRegId 
          },
          update: {
            $set: {
              "students.$.status": status,
              "students.$.verifiedBy": coordinatorId,
              "students.$.verifiedAt": new Date(),
              "students.$.remarks": remarks || ""
            }
          }
        }
      });
    }

    let bulkResult = null;
    if (bulkOps.length > 0) {
      bulkResult = await HackRegister.bulkWrite(bulkOps);
    }

    res.json({
      success: true,
      processed: bulkResult ? bulkResult.modifiedCount : 0,
      errors: invalidUpdates.length,
      results: updates.filter(up => !invalidUpdates.some(iu => iu.update === up)).map(up => ({ update: up, success: true })),
      invalidUpdates
    });

  } catch (err) {
    logger.error("Error in bulk update", { error: err.message });
    res.status(500).json({ error: "Server error" });
  }
});

// 🔟 Delete student registration
router.delete("/student/:registrationId/:studentRegId", async (req, res) => {
  try {
    const { registrationId, studentRegId } = req.params;

    const registration = await HackRegister.findById(registrationId);
    if (!registration) {
      return res.status(404).json({ error: "Registration not found" });
    }

    const studentIndex = registration.students.findIndex(
      s => s._id.toString() === studentRegId
    );

    if (studentIndex === -1) {
      return res.status(404).json({ error: "Student registration not found" });
    }

    // Delete the receipt file from GridFS
    const student = registration.students[studentIndex];
    if (student.feeReceiptFileId) {
      await deleteReceipt(student.feeReceiptFileId);
    }

    // Remove student from array
    registration.students.splice(studentIndex, 1);

    // If no students left, delete the entire registration document
    if (registration.students.length === 0) {
      await HackRegister.findByIdAndDelete(registrationId);
    } else {
      await registration.save();
    }

    res.json({
      success: true,
      message: "Student registration deleted successfully"
    });
  } catch (err) {
    logger.error("Error deleting registration", { error: err.message });
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Legacy/Compatibility routes ──────────────────────────────────────────────
router.put("/:id/status", async (req, res) => {
  try {
    const { status, coordinatorId } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const updated = await HackRegister.findByIdAndUpdate(
      req.params.id,
      { status, verifiedBy: coordinatorId },
      { new: true }
    )
      .populate("students.student", "name email rollNo")
      .populate("hackathon", "hackathonname entryfee");

    res.json(updated);
  } catch (err) {
    logger.error("Error in legacy status update", { error: err.message });
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/hackathon/:hackathonId/approved", async (req, res) => {
  try {
    const approved = await HackRegister.find({
      hackathon: req.params.hackathonId,
      "students.status": "approved",
    }).populate("students.student", "name email rollNo");

    res.json(approved);
  } catch (err) {
    logger.error("Error in fetching legacy approved registrations", { error: err.message });
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/hackathon/:hackathonId/student/:studentId/status", async (req, res) => {
  try {
    const { hackathonId, studentId } = req.params;

    const registration = await HackRegister.findOne(
      { hackathon: hackathonId, "students.student": studentId },
      { "students.$": 1 }
    ).populate("students.student", "name email rollNo");

    if (!registration || registration.students.length === 0) {
      return res.status(200).json({ status: null });
    }

    const studentData = registration.students[0];
    res.json({
      student: studentData.student,
      status: studentData.status,
      transactionId: studentData.transactionId,
      upiUtrNumber: studentData.upiUtrNumber,
      registeredAt: studentData.registeredAt,
    });
  } catch (err) {
    logger.error("Error fetching fee status", { error: err.message });
    res.status(500).json({ error: "Server error" });
  }
});

router.get('/approved/:hackathonId', authenticateToken, async (req, res) => {
  try {
    const { hackathonId } = req.params;
    const userId = req.user.userId || req.user.id || req.user._id;
    const reg = await HackRegister.findOne({ hackathon: hackathonId });
    if (!reg) return res.json([]);
    const approved = reg.students.filter(s => s.student.toString() === userId && s.status === 'approved');
    res.json(approved);
  } catch (err) {
    logger.error("Failed to fetch approved registration", { error: err.message });
    res.status(500).json({ error: 'Failed to fetch approved registration' });
  }
});

module.exports = router;