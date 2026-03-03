const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { Student } = require('../models/roles');

// Email configuration
const emailConfig = {
  host: 'smtp.gmail.com', // or your email provider
  port: 587,
  secure: false,
  auth: {
    user: process.env.ADMIN_USER, // Your email
    pass: process.env.ADMIN_PASS  // Your email password or app password
  }
};

const transporter = nodemailer.createTransport(emailConfig);

// Email template
const generateEmailTemplate = (studentName, email, password) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { text-align: center; color: #333; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #4CAF50; margin-bottom: 10px; }
            .content { line-height: 1.6; color: #555; }
            .credentials { background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center; }
            .button { display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🎓 Student Portal</div>
                <h2>Welcome to Your Student Account!</h2>
            </div>
            
            <div class="content">
                <p>Dear <strong>${studentName}</strong>,</p>
                
                <p>Congratulations! Your student account has been successfully created. You can now access the student portal with the credentials provided below.</p>
                
                <div class="credentials">
                    <h3>📋 Your Login Credentials:</h3>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Password:</strong> ${password}</p>
                </div>
                
                <p>🔒 <strong>Important Security Note:</strong> For your security, please change your password after your first login.</p>
                
                <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
                
                <a href="#" class="button">Login to Portal</a>
            </div>
            
            <div class="footer">
                <p>This is an automated message. Please do not reply to this email.</p>
                <p>&copy; 2024 Student Management System. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
  `;
};

// Send email function
async function sendWelcomeEmail(studentName, email, password) {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: '🎓 Welcome to Student Portal - Your Account Details',
      html: generateEmailTemplate(studentName, email, password)
    };
    
    await transporter.sendMail(mailOptions);
    return { success: true, message: 'Email sent successfully' };
  } catch (error) {
    console.error('Email sending failed:', error);
    return { success: false, message: error.message };
  }
}

async function processStudents(students) {
  const registered = [];
  const errors = [];
  const existingStudents = [];
  const emailResults = [];

  for (const student of students) {
    try {
      // Updated required fields to include new fields
      const requiredFields = [
        'name', 
        'email', 
        'phoneNumber', 
        'rollNo', 
        'branch', 
        'year', 
        'college',
        'currentYear',
        'github',
        'linkedin'
      ];
      
      const missingFields = requiredFields.filter(field => !student[field]);
      
      if (missingFields.length > 0) {
        errors.push({ 
          student: student.name || 'Unknown', 
          error: `Missing required fields: ${missingFields.join(', ')}` 
        });
        continue;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(student.email)) {
        errors.push({ 
          student: student.name, 
          error: 'Invalid email format' 
        });
        continue;
      }

      // Validate URLs for GitHub and LinkedIn
      const urlRegex = /^https?:\/\/.+/;
      if (!urlRegex.test(student.github)) {
        errors.push({ 
          student: student.name, 
          error: 'Invalid GitHub URL format' 
        });
        continue;
      }

      if (!urlRegex.test(student.linkedin)) {
        errors.push({ 
          student: student.name, 
          error: 'Invalid LinkedIn URL format' 
        });
        continue;
      }

      // Check if student already exists
      const existingStudent = await Student.findOne({ 
        $or: [
          { email: student.email }, 
          { phoneNumber: student.phoneNumber }, 
          { rollNo: student.rollNo }
        ] 
      });

      if (existingStudent) {
        existingStudents.push({ 
          name: student.name, 
          email: student.email 
        });
        continue;
      }

      // Hash password (using email as default password)
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(student.email, salt);

      // Create new student with all fields
      const newStudent = new Student({
        name: student.name,
        email: student.email,
        phoneNumber: student.phoneNumber,
        rollNo: student.rollNo,
        branch: student.branch,
        year: student.year,
        college: student.college,
        currentYear: student.currentYear,
        github: student.github,
        linkedin: student.linkedin,
        password: hashedPassword
      });

      await newStudent.save();
      registered.push(student.name);

      // Send welcome email
      const emailResult = await sendWelcomeEmail(
        student.name, 
        student.email, 
        student.email // Using email as default password
      );
      
      emailResults.push({
        student: student.name,
        email: student.email,
        emailSent: emailResult.success,
        emailError: emailResult.success ? null : emailResult.message
      });

    } catch (error) {
      console.error('Error processing student:', error);
      errors.push({ 
        student: student.name || 'Unknown', 
        error: error.message 
      });
    }
  }

  return { 
    registered, 
    errors, 
    existingStudents, 
    emailResults 
  };
}

module.exports = processStudents;