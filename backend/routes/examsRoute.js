const router = require("express").Router();
const Exam = require("../models/examModel");
const { authenticateToken } = require("../middleware/auth");
const mongoose = require("mongoose");
const Question = require("../models/questionModel");
const { Student } = require("../models/roles");
const Report = require("../models/reportModel");
const { asyncHandler, AppError } = require("../utils/errorHandler");

// Add exam
router.post("/add", authenticateToken, asyncHandler(async (req, res) => {
  const { name, currentYear } = req.body;

  if (!currentYear) {
    return res.status(400).json({ 
      success: false, 
      message: "Current year is required" 
    });
  }

  const examExists = await Exam.findOne({ name, currentYear }).lean();
  if (examExists) {
    return res.status(409).json({ 
      success: false, 
      message: "Exam already exists for this year" 
    });
  }

  const newExam = new Exam({ ...req.body, questions: [] });
  await newExam.save();
  
  res.status(201).json({
    success: true,
    message: "Exam added successfully",
    data: newExam,
  });
}));

// Get all exams - OPTIMIZED
router.post("/get-all-exams", authenticateToken, asyncHandler(async (req, res) => {
  const exams = await Exam.find({})
    .select("name description currentYear duration questions createdAt")
    .lean()
    .limit(1000); // Safety limit

  res.json({
    success: true,
    message: "Exams fetched successfully",
    data: exams,
  });
}));

// Get user-specific exams - OPTIMIZED
router.post("/get-user-exams", authenticateToken, asyncHandler(async (req, res) => {
  const { userId, currentYear: requestedYear } = req.body;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid user ID" 
    });
  }

  const student = await Student.findById(userId)
    .select("currentYear")
    .lean();

  if (!student) {
    return res.status(404).json({ 
      success: false, 
      message: "Student not found" 
    });
  }

  const targetYear = requestedYear || student.currentYear;

  if (!targetYear) {
    return res.status(400).json({
      success: false,
      message: "Current year not set",
      data: { ongoingExams: [], completedExams: [] },
    });
  }

  // Single query with filtering - NO N+1 PROBLEM
  const exams = await Exam.find({ currentYear: targetYear })
    .select("name description duration questions attemptedBy")
    .lean();

  const studentObjId = new mongoose.Types.ObjectId(userId);
  const ongoingExams = exams.filter(
    exam => !exam.attemptedBy.some(id => id.equals(studentObjId))
  );
  const completedExams = exams.filter(
    exam => exam.attemptedBy.some(id => id.equals(studentObjId))
  );

  res.json({
    success: true,
    message: "User exams fetched successfully",
    data: { ongoingExams, completedExams },
  });
}));

// Get exam by ID - OPTIMIZED
router.post("/get-exam-by-id", authenticateToken, asyncHandler(async (req, res) => {
  const { examId } = req.body;

  if (!examId || !mongoose.Types.ObjectId.isValid(examId)) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid exam ID" 
    });
  }

  const exam = await Exam.findById(examId)
    .populate({
      path: "questions",
      select: "questionText options correctAnswer difficulty marks",
      options: { lean: true }
    })
    .lean();

  if (!exam) {
    return res.status(404).json({ 
      success: false, 
      message: "Exam not found" 
    });
  }

  res.json({
    success: true,
    message: "Exam fetched successfully",
    data: exam,
  });
}));

// Edit exam - OPTIMIZED
router.post("/edit-exam-by-id", authenticateToken, asyncHandler(async (req, res) => {
  const { examId, ...updates } = req.body;

  if (!examId || !mongoose.Types.ObjectId.isValid(examId)) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid exam ID" 
    });
  }

  const exam = await Exam.findByIdAndUpdate(examId, updates, { 
    new: true, 
    runValidators: true 
  });

  if (!exam) {
    return res.status(404).json({ 
      success: false, 
      message: "Exam not found" 
    });
  }

  res.json({
    success: true,
    message: "Exam updated successfully",
    data: exam,
  });
}));

// Delete exam - OPTIMIZED
router.post("/delete-exam-by-id", authenticateToken, asyncHandler(async (req, res) => {
  const { examId } = req.body;

  if (!examId || !mongoose.Types.ObjectId.isValid(examId)) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid exam ID" 
    });
  }

  const exam = await Exam.findByIdAndDelete(examId);

  if (!exam) {
    return res.status(404).json({ 
      success: false, 
      message: "Exam not found" 
    });
  }

  res.json({
    success: true,
    message: "Exam deleted successfully",
  });
}));

// Add question to exam
router.post("/add-question-to-exam", authenticateToken, asyncHandler(async (req, res) => {
  const { exam: examId, ...questionData } = req.body;

  if (!examId || !mongoose.Types.ObjectId.isValid(examId)) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid exam ID" 
    });
  }

  const newQuestion = new Question(questionData);
  await newQuestion.save();

  const exam = await Exam.findByIdAndUpdate(
    examId,
    { $push: { questions: newQuestion._id } },
    { new: true }
  );

  if (!exam) {
    return res.status(404).json({ 
      success: false, 
      message: "Exam not found" 
    });
  }

  res.status(201).json({
    success: true,
    message: "Question added successfully",
    data: newQuestion,
  });
}));

// Edit question in exam
router.post("/edit-question-in-exam", authenticateToken, asyncHandler(async (req, res) => {
  const { questionId, ...updates } = req.body;

  if (!questionId || !mongoose.Types.ObjectId.isValid(questionId)) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid question ID" 
    });
  }

  const question = await Question.findByIdAndUpdate(questionId, updates, { 
    new: true,
    runValidators: true 
  });

  if (!question) {
    return res.status(404).json({ 
      success: false, 
      message: "Question not found" 
    });
  }

  res.json({
    success: true,
    message: "Question updated successfully",
    data: question,
  });
}));

// Delete question from exam
router.post("/delete-question-in-exam", authenticateToken, asyncHandler(async (req, res) => {
  const { questionId, examId } = req.body;

  if (!questionId || !examId || 
      !mongoose.Types.ObjectId.isValid(questionId) ||
      !mongoose.Types.ObjectId.isValid(examId)) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid IDs" 
    });
  }

  await Question.findByIdAndDelete(questionId);

  const exam = await Exam.findByIdAndUpdate(
    examId,
    { $pull: { questions: questionId } },
    { new: true }
  );

  if (!exam) {
    return res.status(404).json({ 
      success: false, 
      message: "Exam not found" 
    });
  }

  res.json({
    success: true,
    message: "Question deleted successfully",
  });
}));

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
