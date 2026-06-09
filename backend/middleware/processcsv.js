const bcrypt = require('bcryptjs');
const { Student } = require('../models/roles');

async function processStudents(students) {
  const registered = [];
  const errors = [];
  const existingStudents = [];

  for (const student of students) {
    try {
      // Check for missing required fields
      const requiredFields = ['name', 'email', 'phoneNumber', 'rollNo', 'branch', 'year', 'college'];
      const missingFields = requiredFields.filter(field => !student[field]);
      
      if (missingFields.length > 0) {
        errors.push({ student: student.name || 'Unknown', error: `Missing required fields: ${missingFields.join(', ')}` });
        continue;
      }

      // Check if student already exists
      const existingStudent = await Student.findOne({ $or: [{ email: student.email }, { phoneNumber: student.phoneNumber }, { rollNo: student.rollNo }] });
      if (existingStudent) {
        existingStudents.push({ name: student.name, email: student.email });
        continue;
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(student.email, salt);

      // Create new student
      const newStudent = new Student({
        ...student,
        password: hashedPassword
      });

      await newStudent.save();
      registered.push(student.name);
    } catch (error) {
      console.error('Error processing student:', error);
      errors.push({ student: student.name || 'Unknown', error: error.message });
    }
  }

  return { registered, errors, existingStudents };
}

module.exports = processStudents;