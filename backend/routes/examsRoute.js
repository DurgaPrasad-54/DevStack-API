const router = require("express").Router();
const Exam = require("../models/examModel");
const { authenticateToken } = require("../middleware/auth");
const mongoose = require("mongoose");
const Question = require("../models/questionModel");
const { Student } = require("../models/roles");
const Report = require("../models/reportModel"); // Import Report model

// add exam
router.post("/add", authenticateToken, async (req, res) => {
  try {
    // check if exam already exists
    const examExists = await Exam.findOne({ name: req.body.name });
    if (examExists) {
      return res
        .status(200)
        .send({ message: "Exam already exists", success: false });
    }
    if (!req.body.currentYear) {
      return res.status(400).send({ message: "Current year is required", success: false });
    }
    req.body.questions = [];
    const newExam = new Exam(req.body);
    await newExam.save();
    res.send({
      message: "Exam added successfully",
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

// get all exams
router.post("/get-all-exams", authenticateToken, async (req, res) => {
  try {
    const exams = await Exam.find({});
    console.log(exams)
    res.send({
      message: "Exams fetched successfully",
      data: exams,
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

// get all exams
// router.post("/get-all-exams", authenticateToken, async (req, res) => {
//   try {
//     const studentId = new mongoose.Types.ObjectId(req.body.userId); // Correctly create ObjectId
//     const exams = await Exam.find({});

//     const ongoingExams = exams.filter(exam => !exam.attemptedBy.some(id => id.equals(studentId)));
//     const completedExams = exams.filter(exam => exam.attemptedBy.some(id => id.equals(studentId)));
//     console.log(completedExams);
//     res.send({
//       message: "Exams fetched successfully",
//       data: {
//         ongoingExams,
//         completedExams
//       },
//       success: true,
//     });
//   } catch (error) {
//     res.status(500).send({
//       message: error.message,
//       data: error,
//       success: false,
//     });
//   }
// });

// get user-specific exams
router.post("/get-user-exams", authenticateToken, async (req, res) => {
  try {
    const userId = req.body.userId;
    let currentYear = req.body.currentYear; // allow currentYear from request
    console.log(userId,currentYear)
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).send({ message: "Invalid or missing user ID", success: false });
    }
    const studentId = new mongoose.Types.ObjectId(userId);
    const student = await Student.findById(userId);
    if (!student) {
      return res.status(404).send({ message: "Student not found", success: false });
    }
    // If currentYear is not provided in req.body, use student's currentYear
    if (!currentYear) {
      currentYear = student.currentYear;
    }
    if (!currentYear) {
      return res.status(400).send({
        message: "Your current year is not set. Please contact admin.",
        success: false,
        data: { ongoingExams: [], completedExams: [] }
      });
    }
    // Only fetch exams for the specified current year
    const exams = await Exam.find({ currentYear });
    if (!exams || exams.length === 0) {
      return res.status(200).send({
        message: `No exams found for the current year (${currentYear}).`,
        success: true,
        data: { ongoingExams: [], completedExams: [] }
      });
    }
    const ongoingExams = exams.filter(exam => !exam.attemptedBy.some(id => id.equals(studentId)));
    const completedExams = exams.filter(exam => exam.attemptedBy.some(id => id.equals(studentId)));
    
    res.send({
      message: "User-specific exams fetched successfully",
      data: {
        ongoingExams,
        completedExams
      },
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


// get exam by id
router.post("/get-exam-by-id", authenticateToken, async (req, res) => {
  try {
    const exam = await Exam.findById(req.body.examId).populate("questions");
    res.send({
      message: "Exam fetched successfully",
      data: exam,
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

// edit exam by id
router.post("/edit-exam-by-id", authenticateToken, async (req, res) => {
  try {
    await Exam.findByIdAndUpdate(req.body.examId, req.body);
    res.send({
      message: "Exam edited successfully",
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

// delete exam by id
router.post("/delete-exam-by-id", authenticateToken, async (req, res) => {
  try {
    await Exam.findByIdAndDelete(req.body.examId);
    res.send({
      message: "Exam deleted successfully",
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

// add question to exam

router.post("/add-question-to-exam", authenticateToken, async (req, res) => {
  try {
    // add question to Questions collection
    const newQuestion = new Question(req.body);
    const question = await newQuestion.save();

    // add question to exam
    const exam = await Exam.findById(req.body.exam);
    exam.questions.push(question._id);
    await exam.save();
    res.send({
      message: "Question added successfully",
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

// edit question in exam
router.post("/edit-question-in-exam", authenticateToken, async (req, res) => {
  try {
    // edit question in Questions collection
    await Question.findByIdAndUpdate(req.body.questionId, req.body);
    res.send({
      message: "Question edited successfully",
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

// delete question in exam
router.post("/delete-question-in-exam", authenticateToken, async (req, res) => {
  try {
    // delete question in Questions collection
    await Question.findByIdAndDelete(req.body.questionId);

    // delete question in exam
    const exam = await Exam.findById(req.body.examId);
    exam.questions = exam.questions.filter(
      (question) => question._id != req.body.questionId
    );
    await exam.save();
    res.send({
      message: "Question deleted successfully",
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

// add user to attemptedBy field in exam
router.post("/attempt-exam", authenticateToken, async (req, res) => {
  try {
    const { examId, userId } = req.body;
    console.log(examId, userId);
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).send({ message: "Exam not found", success: false });
    }
    if (!exam.attemptedBy.includes(userId)) {
      exam.attemptedBy.push(userId);
      await exam.save();
    }
    res.send({
      message: "User added to attemptedBy field successfully",
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

// Set marks to zero for unattempted exams
router.post("/set-zero-marks-for-unattempted", authenticateToken, async (req, res) => {
  try {
    const { examId } = req.body;
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).send({ message: "Exam not found", success: false });
    }

    const currentTime = new Date();
    if (currentTime > exam.endDate) {
      const students = await Student.find({});
      const studentIds = students.map(student => student._id);

      for (const studentId of studentIds) {
        if (!exam.attemptedBy.includes(studentId)) {
          exam.attemptedBy.push(studentId);
          // Create a report with zero marks for students who have not attempted the exam
          const report = new Report({
            exam: examId,
            user: studentId,
            result: {
              correctAnswers: [],
              wrongAnswers: [],
              verdict: "Fail",
            },
          });
          await report.save();
        }
      }

      await exam.save();
      res.send({
        message: "Marks set to zero for unattempted exams",
        success: true,
      });
    } else {
      res.send({
        message: "Exam is still ongoing",
        success: false,
      });
    }
  } catch (error) {
    res.status(500).send({
      message: error.message,
      data: error,
      success: false,
    });
  }
});

// router.post("/get-user-info", authenticateToken, async (req, res) => {
//   try {
//     const user = await Student.findById(req.body.userId);
//     res.send({
//       message: "User info fetched successfully",
//       success: true,
//       data: user,
//     });
//   } catch (error) {
//     res.status(500).send({
//       message: error.message,
//       data: error,
//       success: false,
//     });
//   }
// });

module.exports = router;
