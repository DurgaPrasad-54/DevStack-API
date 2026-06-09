const { authenticateToken } = require("../middleware/auth");
const Certificate = require("../models/main-certificate");
const GradeCriteria = require("../models/grade-criteria");
const { Student, Admin } = require("../models/roles");
const Report = require("../models/reportModel");
const Submission = require("../models/submissionModel");
const { v4: uuidv4 } = require('uuid');
const router = require("express").Router();

// Create or update grade criteria
router.post("/grade-criteria", authenticateToken, async (req, res) => {
  try {
    // Ensure user is available from the middleware
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
        code: "AUTH_REQUIRED",
        success: false,
      });
    }

    // Use the userId from the request body if provided, otherwise from the token
    const userId = req.body.userId || req.user?.userId || req.user?.id;
    
    // Find admin by ID
    const admin = await Admin.findById(userId);
    if (!admin) {
      return res.status(403).send({
        message: "Admin not found",
        success: false,
      });
    }

    const { programName, currentYear, passingMarks, totalMarks, grades } = req.body;

    // Validate input
    if (
      !programName ||
      !currentYear ||
      passingMarks === undefined ||
      totalMarks === undefined ||
      !grades ||
      !Array.isArray(grades)
    ) {
      return res.status(400).send({
        message: "Invalid input: Missing required fields (programName, currentYear, passingMarks, totalMarks, grades)",
        success: false,
      });
    }

    // Validate currentYear
    const validYears = ['first year', 'second year', 'third year', 'fourth year', 'alumni'];
    if (!validYears.includes(currentYear)) {
      return res.status(400).send({
        message: "Invalid currentYear. Must be one of: " + validYears.join(', '),
        success: false,
      });
    }

    // Validate grades structure
    for (const grade of grades) {
      if (!grade.grade || grade.minMarks === undefined || grade.maxMarks === undefined) {
        return res.status(400).send({
          message: "Invalid grade criteria format",
          success: false,
        });
      }
    }

    // Check if criteria already exists for this program and year
    let criteria = await GradeCriteria.findOne({ programName, currentYear });
    
    if (criteria) {
      // Update existing criteria
      criteria.passingMarks = passingMarks;
      criteria.totalMarks = totalMarks;
      criteria.grades = grades;
      criteria.updatedAt = Date.now();
      await criteria.save();
    } else {
      // Create new criteria
      criteria = new GradeCriteria({
        programName,
        currentYear,
        passingMarks,
        totalMarks,
        grades,
        createdBy: userId,
        certificatesGenerated: false
      });
      await criteria.save();
    }

    res.send({
      message: "Grade criteria saved successfully",
      data: criteria,
      success: true,
    });
  } catch (error) {
    console.error("Error in grade criteria:", error);
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

// Update a specific grade criteria by ID
router.put("/grade-criteria/:id", authenticateToken, async (req, res) => {
  try {
    // Ensure user is available from the middleware
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
        code: "AUTH_REQUIRED",
        success: false,
      });
    }

    const criteriaId = req.params.id;
    const userId = req.body.userId || req.user?.userId || req.user?.id;
    
    // Find admin by ID
    const admin = await Admin.findById(userId);
    if (!admin) {
      return res.status(403).send({
        message: "Admin not found",
        success: false,
      });
    }

    const { programName, currentYear, passingMarks, totalMarks, grades } = req.body;

    // Validate input
    if (
      !programName ||
      !currentYear ||
      passingMarks === undefined ||
      totalMarks === undefined ||
      !grades ||
      !Array.isArray(grades)
    ) {
      return res.status(400).send({
        message: "Invalid input: Missing required fields",
        success: false,
      });
    }

    // Validate currentYear
    const validYears = ['first year', 'second year', 'third year', 'fourth year', 'alumni'];
    if (!validYears.includes(currentYear)) {
      return res.status(400).send({
        message: "Invalid currentYear. Must be one of: " + validYears.join(', '),
        success: false,
      });
    }

    // Validate grades structure
    for (const grade of grades) {
      if (!grade.grade || grade.minMarks === undefined || grade.maxMarks === undefined) {
        return res.status(400).send({
          message: "Invalid grade criteria format",
          success: false,
        });
      }
    }

    // Find criteria by ID
    const criteria = await GradeCriteria.findById(criteriaId);
    
    if (!criteria) {
      return res.status(404).send({
        message: "Grade criteria not found",
        success: false,
      });
    }

    // Check if certificates have been generated - only allow updates to the grades
    if (criteria.certificatesGenerated) {
      // If certificates have been generated, only allow updating the grades
      criteria.grades = grades;
      criteria.updatedAt = Date.now();
    } else {
      // Otherwise allow full update
      criteria.programName = programName;
      criteria.currentYear = currentYear;
      criteria.passingMarks = passingMarks;
      criteria.totalMarks = totalMarks;
      criteria.grades = grades;
      criteria.updatedAt = Date.now();
    }
    
    await criteria.save();
    
    res.send({
      message: "Grade criteria updated successfully",
      data: criteria,
      success: true,
    });
  } catch (error) {
    console.error("Error updating grade criteria:", error);
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

// Generate certificates for all students (Updated to filter by currentYear)
router.post("/generate-certificates", authenticateToken, async (req, res) => {
  try {
    // Ensure user is available from the middleware
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
        code: "AUTH_REQUIRED",
        success: false,
      });
    }

    // Use the userId from the request body if provided, otherwise from the token
    const userId = req.body.userId || req.user?.userId || req.user?.id;

    // Find admin by ID
    const admin = await Admin.findById(userId);
    if (!admin) {
      return res.status(403).send({
        message: "Admin not found",
        success: false,
      });
    }

    const { programName, currentYear } = req.body;
    
    if (!programName || !currentYear) {
      return res.status(400).send({
        message: "Program name and current year are required",
        success: false,
      });
    }

    // Check if certificates were already generated for this program and year
    const existingCertificates = await Certificate.findOne({ programName, currentYear });
    if (existingCertificates) {
      return res.status(400).send({
        message: "Certificates have already been generated for this program and year",
        success: false,
      });
    }

    // Get grade criteria for the specific program and year
    const criteria = await GradeCriteria.findOne({ programName, currentYear });
    if (!criteria) {
      return res.status(404).send({
        message: "Grade criteria not found for this program and year",
        success: false,
      });
    }

    // Get all students for the selected currentYear
    const students = await require("../models/roles").Student.find({ currentYear });

    // Get all reports and submissions
    const reports = await Report.find().populate("exam").populate("user");
    const submissions = await Submission.find().populate("student");

    // Aggregate marks for only students in the selected year
    const studentMarks = {};

    // Initialize studentMarks for all students in the selected year
    students.forEach(student => {
      studentMarks[student._id.toString()] = {
        student,
        totalMarks: 0,
      };
    });

    // Add marks from reports
    reports.forEach(report => {
      if (
        report.user &&
        report.user._id &&
        studentMarks[report.user._id.toString()]
      ) {
        studentMarks[report.user._id.toString()].totalMarks += report.result.correctAnswers.length;
      }
    });

    // Add marks from submissions
    submissions.forEach(submission => {
      if (
        submission.student &&
        submission.student._id &&
        studentMarks[submission.student._id.toString()]
      ) {
        studentMarks[submission.student._id.toString()].totalMarks += submission.marks || 0;
      }
    });

    // Generate certificates
    const certificates = [];
    const failedStudents = [];

    for (const [studentId, data] of Object.entries(studentMarks)) {
      try {
        // Normalize marks to a percentage of total possible marks
        const normalizedMarks = (data.totalMarks / criteria.totalMarks) * 100;
        let grade = "";
        let certificateType = "participation";

        // Determine grade and certificate type
        if (normalizedMarks >= criteria.passingMarks) {
          certificateType = "completion";
          
          // Find applicable grade
          for (const gradeInfo of criteria.grades) {
            if (normalizedMarks >= gradeInfo.minMarks && normalizedMarks <= gradeInfo.maxMarks) {
              grade = gradeInfo.grade;
              break;
            }
          }
        } else {
          grade = "F"; // Failing grade
        }

        // Generate unique certificate ID
        const certificateId = uuidv4();

        // Create certificate
        const certificate = new Certificate({
          student: studentId,
          programName,
          currentYear, // Store the current year in the certificate
          totalMarks: data.totalMarks,
          grade,
          certificateType,
          certificateId,
          issuedBy: userId
        });

        await certificate.save();
        certificates.push(certificate);
      } catch (error) {
        failedStudents.push({ studentId, error: error.message });
      }
    }

    // Update the grade criteria to mark that certificates have been generated
    criteria.certificatesGenerated = true;
    await criteria.save();

    res.send({
      message: "Certificates generated successfully",
      data: {
        certificates,
        failedStudents,
        totalGenerated: certificates.length,
        totalFailed: failedStudents.length,
        programName,
        currentYear
      },
      success: true,
    });
  } catch (error) {
    console.error("Error generating certificates:", error);
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

// Get all certificates (updated to include currentYear in population)
router.get("/certificates", authenticateToken, async (req, res) => {
  try {
    const certificates = await Certificate.find()
      .populate("student", "name email rollNo branch year college currentYear")
      .populate("issuedBy", "name email")
      .sort({ issueDate: -1 });
    
    res.send({
      message: "Certificates fetched successfully",
      data: certificates,
      success: true,
    });
  } catch (error) {
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

// Get certificates for a specific student (updated to include currentYear)
router.get("/student-certificates/:studentId", authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const certificates = await Certificate.find({ student: studentId })
      .populate("student", "name email rollNo branch year college currentYear")
      .populate("issuedBy", "name email")
      .sort({ issueDate: -1 });
    
    res.send({
      message: "Student certificates fetched successfully",
      data: certificates,
      success: true,
    });
  } catch (error) {
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

// Get a single certificate by ID (updated to include currentYear)
router.get("/certificate/:certificateId", async (req, res) => {
  try {
    const { certificateId } = req.params;
    
    const certificate = await Certificate.findOne({ certificateId })
      .populate("student", "name email rollNo branch year college currentYear")
      .populate("issuedBy", "name email");
    
    if (!certificate) {
      return res.status(404).send({
        message: "Certificate not found",
        success: false,
      });
    }
    
    res.send({
      message: "Certificate fetched successfully",
      data: certificate,
      success: true,
    });
  } catch (error) {
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

// Download certificates by program and year
router.get("/download-certificates/:programName/:currentYear", authenticateToken, async (req, res) => {
  try {
    // Ensure user is available from the middleware
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
        code: "AUTH_REQUIRED",
        success: false,
      });
    }

    const { programName, currentYear } = req.params;
    
    if (!programName || !currentYear) {
      return res.status(400).send({
        message: "Program name and current year are required",
        success: false,
      });
    }

    // Get all certificates for the specified program and year
    const certificates = await Certificate.find({ programName, currentYear })
      .populate("student", "name email rollNo branch year college currentYear")
      .populate("issuedBy", "name email")
      .sort({ issueDate: -1 });
    
    if (certificates.length === 0) {
      return res.status(404).send({
        message: "No certificates found for this program and year",
        success: false,
      });
    }
    
    // Return the certificates data
    res.send({
      message: "Certificates fetched successfully",
      data: certificates,
      success: true,
    });
  } catch (error) {
    console.error("Error fetching certificates:", error);
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

// Alternative route for backward compatibility (program name only)
router.get("/download-certificates/:programName", authenticateToken, async (req, res) => {
  try {
    // Ensure user is available from the middleware
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
        code: "AUTH_REQUIRED",
        success: false,
      });
    }

    const { programName } = req.params;
    
    if (!programName) {
      return res.status(400).send({
        message: "Program name is required",
        success: false,
      });
    }

    // Get all certificates for the specified program (all years)
    const certificates = await Certificate.find({ programName })
      .populate("student", "name email rollNo branch year college currentYear")
      .populate("issuedBy", "name email")
      .sort({ currentYear: 1, issueDate: -1 });
    
    if (certificates.length === 0) {
      return res.status(404).send({
        message: "No certificates found for this program",
        success: false,
      });
    }
    
    // Return the certificates data grouped by year
    const certificatesByYear = certificates.reduce((acc, cert) => {
      if (!acc[cert.currentYear]) {
        acc[cert.currentYear] = [];
      }
      acc[cert.currentYear].push(cert);
      return acc;
    }, {});
    
    res.send({
      message: "Certificates fetched successfully",
      data: {
        all: certificates,
        byYear: certificatesByYear
      },
      success: true,
    });
  } catch (error) {
    console.error("Error fetching certificates:", error);
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

// Public route: Get all grade criteria (no authentication)
router.get("/all-grade-criteria", async (req, res) => {
  try {
    const criteria = await GradeCriteria.find()
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });
    res.send({
      message: "All grade criteria fetched successfully",
      data: criteria,
      success: true,
    });
  } catch (error) {
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

// Add this endpoint to your backend router (after the existing routes)

// Get all grade criteria
router.get("/grade-criteria", authenticateToken, async (req, res) => {
  try {
    // Ensure user is available from the middleware
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
        code: "AUTH_REQUIRED",
        success: false,
      });
    }

    // Get all grade criteria
    const criteria = await GradeCriteria.find()
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });
    
    res.send({
      message: "Grade criteria fetched successfully",
      data: criteria,
      success: true,
    });
  } catch (error) {
    console.error("Error fetching grade criteria:", error);
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

// Get generated programs (for checking which programs already have certificates)
router.get("/generated-programs", authenticateToken, async (req, res) => {
  try {
    // Ensure user is available from the middleware
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
        code: "AUTH_REQUIRED",
        success: false,
      });
    }

    // Get distinct program names and years where certificates have been generated
    const generatedPrograms = await Certificate.distinct("programName", {}).then(async (programNames) => {
      const programs = [];
      for (const programName of programNames) {
        const years = await Certificate.distinct("currentYear", { programName });
        for (const year of years) {
          programs.push({ programName, currentYear: year });
        }
      }
      return programs;
    });
    
    res.send({
      message: "Generated programs fetched successfully",
      data: generatedPrograms,
      success: true,
    });
  } catch (error) {
    console.error("Error fetching generated programs:", error);
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

// Delete grade criteria by ID
router.delete("/grade-criteria/:id", authenticateToken, async (req, res) => {
  try {
    // Ensure user is available from the middleware
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
        code: "AUTH_REQUIRED",
        success: false,
      });
    }

    const criteriaId = req.params.id;
    const userId = req.user?.userId || req.user?.id;
    
    // Find admin by ID
    const admin = await Admin.findById(userId);
    if (!admin) {
      return res.status(403).send({
        message: "Admin not found",
        success: false,
      });
    }

    // Find criteria by ID
    const criteria = await GradeCriteria.findById(criteriaId);
    
    if (!criteria) {
      return res.status(404).send({
        message: "Grade criteria not found",
        success: false,
      });
    }

    // Check if certificates have been generated for this criteria
    const existingCertificates = await Certificate.findOne({ 
      programName: criteria.programName, 
      currentYear: criteria.currentYear 
    });
    
    if (existingCertificates) {
      return res.status(400).send({
        message: "Cannot delete grade criteria. Certificates have already been generated for this program and year.",
        success: false,
      });
    }

    // Delete the criteria
    await GradeCriteria.findByIdAndDelete(criteriaId);
    
    res.send({
      message: "Grade criteria deleted successfully",
      success: true,
    });
  } catch (error) {
    console.error("Error deleting grade criteria:", error);
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

module.exports = router;