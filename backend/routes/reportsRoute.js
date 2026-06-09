const { authenticateToken, authenticateStudentToken } = require("../middleware/auth");
const Exam = require("../models/examModel");
const { Student } = require("../models/roles"); // Importing Student model
const Report = require("../models/reportModel");
const Submission = require("../models/submissionModel"); // Import Submission model
const router = require("express").Router();

// Add report
router.post("/add-report", authenticateToken, async (req, res) => {
  try {
    const newReport = new Report(req.body);
    console.log(req.body);
    await newReport.save();
    res.send({
      message: "Attempt added successfully",
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

// Get all reports
router.post("/get-all-reports", authenticateToken, async (req, res) => {
  try {
    const { examName, studentName } = req.body;
    console.log("Request Body:", req.body);
    // Validate input
    if (typeof examName !== 'string' || typeof studentName !== 'string') {
      return res.status(400).send({
        message: "Invalid input: examName and studentName must be strings.",
        success: false,
      });
    }

    const exams = await Exam.find({
      name: {
        $regex: examName,
        $options: 'i' // Optional: case-insensitive search
      },
    });

    const matchedExamIds = exams.map((exam) => exam._id);

    const students = await Student.find({
      name: {
        $regex: studentName,
        $options: 'i' // Optional: case-insensitive search
      },
    });

    const matchedStudentIds = students.map((student) => student._id);

    const reports = await Report.find({
      exam: {
        $in: matchedExamIds,
      },
      user: {
        $in: matchedStudentIds,
      },
    })
      .populate("exam")
      .populate("user")
      .sort({ createdAt: -1 });

      // console.log("Reports:", reports);

    res.send({
      message: "Attempts fetched successfully",
      data: reports,
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

// Get all reports by student
router.post("/get-all-reports-by-student", authenticateStudentToken, async (req, res) => {
  try {
    const studentId = req.studentId; // Use the student ID from the new middleware
    console.log("Student ID:", studentId); // Log the student ID for debugging

    const reports = await Report.find({ user: studentId })
      .populate({
        path: 'exam',
        select: 'name totalMarks passingMarks duration', // Select specific fields from the exam
      })
      .populate({
        path: 'user',
        select: 'name email', // Select specific fields from the user
      })
      .sort({ createdAt: -1 });
      console.log("Reports:", reports);

    console.log("Reports Data:", reports); // Log the reports data for debugging

    res.send({
      message: "Attempts fetched successfully",
      data: reports,
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

// Get total marks of all quizzes for a particular student
router.post("/get-total-marks-by-student", authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.body;

    // Validate input
    if (typeof studentId !== 'string') {
      return res.status(400).send({
        message: "Invalid input: studentId must be a string.",
        success: false,
      });
    }

    const reports = await Report.find({ user: studentId }) // Assuming 'user' refers to studentId
      .populate("exam");

    const totalMarks = reports.reduce((acc, report) => acc + report.marks, 0);

    res.send({
      message: "Total marks fetched successfully",
      data: totalMarks,
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

// Get total marks of all quizzes and tasks for all students
router.post("/get-total-marks-all-students", authenticateToken, async (req, res) => {
  try {
    const reports = await Report.find().populate("exam").populate("user");
    const submissions = await Submission.find().populate("student");

    const studentMarks = reports.reduce((acc, report) => {
      if (report.user && report.user._id) {
        const studentId = report.user._id.toString(); // Ensure studentId is a string
        if (!acc[studentId]) {
          acc[studentId] = {
            student: report.user,
            totalMarks: 0,
          };
        }
        acc[studentId].totalMarks += report.result.correctAnswers.length;
      }
      return acc;
    }, {});

    // submissions.forEach(submission => {
    //   if (submission.student && submission.student._id) {
    //     const studentId = submission.student._id.toString(); // Ensure studentId is a string
    //     if (!studentMarks[studentId]) {
    //       studentMarks[studentId] = {
    //         student: submission.student,
    //         totalMarks: 0,
    //       };
    //     }
    //     studentMarks[studentId].totalMarks += submission.marks || 0;
    //   }
    // });

    res.send({
      message: "Total marks for all students fetched successfully",
      data: Object.values(studentMarks),
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

module.exports = router;
