const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');
require('dotenv').config();
const { authenticateToken, requireRole } = require('../middleware/auth');

// ─── JWT helper — always uses SECRET_KEY from env ────────────────────────────
const signToken = (payload, expiresIn = '5h') =>
  jwt.sign(payload, process.env.SECRET_KEY, { expiresIn });


// Import Models
const { Student, Mentor, Admin, Coordinator } = require('../models/roles');

// Single shared transporter — avoids duplicate creation
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
  pool: true,           // Reuse connections
  maxConnections: 5,
});

// Verify transporter on startup
transporter.verify((error) => {
  if (error) logger.error('Email transporter error', { error: error.message });
  else logger.info('Email transporter ready');
});

// Signup Routes
router.post('/student/signup', async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phoneNumber, 
      password, 
      rollNo, 
      branch, 
      year, 
      currentYear,
      college, 
      github, 
      linkedin 
    } = req.body;
    
    logger.info('Student signup attempt', { email: req.body.email });
    
    // Validation for required fields
    if (!name || !email || !phoneNumber || !password || !rollNo || !branch || !year || !currentYear || !college) {
      return res.status(400).json({ 
        error: 'All required fields must be provided' 
      });
    }

    // Validate branch enum
    const validBranches = [
      'Artificial Intelligence (AI)',
      'Artificial Intelligence and Machine Learning (CSM)',
      'Artificial Intelligence and Data Science (AID)',
      'Cyber Security (CSC)',
      'Data Science (CSD)'
    ];
    if (!validBranches.includes(branch)) {
      return res.status(400).json({ 
        error: 'Invalid branch selection. Please select from: ' + validBranches.join(', ')
      });
    }

    // Validate currentYear enum
    const validCurrentYears = ['first year', 'second year', 'third year', 'fourth year', 'alumni'];
    if (!validCurrentYears.includes(currentYear)) {
      return res.status(400).json({ 
        error: 'Invalid current year selection' 
      });
    }

    // Validate college enum
    const validColleges = ['KIET', 'KIET+', 'KIEW'];
    if (!validColleges.includes(college)) {
      return res.status(400).json({ 
        error: 'Invalid college selection' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format' 
      });
    }

    // Validate phone number format (10 digits)
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({ 
        error: 'Phone number must be exactly 10 digits' 
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters long' 
      });
    }

    // Check if student already exists
    const existingStudent = await Student.findOne({
      $or: [
        { email: email },
        { phoneNumber: phoneNumber },
        { rollNo: rollNo }
      ]
    });

    if (existingStudent) {
      let errorMessage = 'Student already exists with this ';
      if (existingStudent.email === email) {
        errorMessage += 'email address';
      } else if (existingStudent.phoneNumber === phoneNumber) {
        errorMessage += 'phone number';
      } else if (existingStudent.rollNo === rollNo) {
        errorMessage += 'roll number';
      }
      return res.status(409).json({ error: errorMessage });
    }
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new student object
    const student = new Student({
      name,
      email,
      phoneNumber,
      password: hashedPassword,
      rollNo,
      branch,
      year,
      currentYear,
      college,
      github: github || null,
      linkedin: linkedin || null
    });
    
    // Save student to database
    await student.save();
    
    logger.info('Student registered', { id: student._id, email: student.email });
    
    res.status(201).json({ 
      message: 'Student registered successfully',
      studentId: student._id
    });
    
  } catch (error) {
    logger.error("Student Signup Error", { error: error.message });
    
    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      let errorMessage = '';
      
      switch (field) {
        case 'email':
          errorMessage = 'This email address is already registered';
          break;
        case 'phoneNumber':
          errorMessage = 'This phone number is already registered';
          break;
        case 'rollNo':
          errorMessage = 'This roll number is already registered';
          break;
        default:
          errorMessage = 'A student with this information already exists';
      }
      
      return res.status(409).json({ error: errorMessage });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        error: 'Validation failed: ' + validationErrors.join(', ') 
      });
    }
    
    // Generic server error
    res.status(500).json({ 
      error: 'Internal server error. Please try again later.' 
    });
  }
});

// Mentor Signup Route
router.post('/mentor/signup', async (req, res) => {
  try {
    const {name, email, phoneNumber, password, github, linkedin} = req.body;

    logger.info('Mentor signup attempt', { email: req.body.email });

    const hashedPassword = await bcrypt.hash(password, 10);

    const mentor = new Mentor({
      name,
      email,
      phoneNumber,
      password: hashedPassword,
      github,
      linkedin,
      status: 'pending' // Set default status to pending
    });

    await mentor.save();
    
    // Optionally notify admin about new pending mentor
    // await notifyAdminAboutPendingMentor(mentor);
    
    res.status(201).json({
      message: 'Mentor registration submitted successfully. Your account is pending approval by an administrator.',
      mentor: mentor._id
    });
  } catch(error) {
    logger.error("Mentor Signup Error", { error: error.message });
    res.status(500).json({error: 'Internal server error'});
  }
});

// Admin Signup Route — SECURED: requires existing admin JWT
router.post('/admin/signup', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { name, email, phoneNumber, password } = req.body;
    if (!name || !email || !phoneNumber || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Admin with this email already exists' });
    }
    if (password.length < 12) {
      return res.status(400).json({ error: 'Admin password must be at least 12 characters' });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const admin = new Admin({ name, email, phoneNumber, password: hashedPassword });
    await admin.save();
    logger.info('Admin created', { createdBy: req.user.userId, newAdminEmail: email });
    res.status(201).json({ message: 'Admin registered successfully' });
  } catch (error) {
    logger.error('Admin signup error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});



// Updated coordinator registration route (admin only)
router.post('/admin/register-coordinator', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { name, email, phoneNumber, college, year, github, linkedin } = req.body;

    // Validate required fields
    if (!name || !email || !phoneNumber || !college || !year || !github || !linkedin) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }

    // Validate college enum
    const validColleges = ['KIET', 'KIET+', 'KIEW'];
    if (!validColleges.includes(college)) {
      return res.status(400).json({ error: 'Invalid college selection' });
    }

    // Validate year enum
    const validYears = ['first year', 'second year', 'third year', 'fourth year'];
    if (!validYears.includes(year)) {
      return res.status(400).json({ error: 'Invalid year selection' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate phone number format (10 digits)
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({ error: 'Phone number must be exactly 10 digits' });
    }

    // Check if coordinator already exists
    const existingCoordinator = await Coordinator.findOne({ email });
    if (existingCoordinator) {
      return res.status(409).json({ error: 'Coordinator already exists with this email address' });
    }

    // Use email as password
    const password = email;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const coordinator = new Coordinator({
      name,
      email,
      phoneNumber,
      college,
      year,
      github,
      linkedin,
      password: hashedPassword
    });

    await coordinator.save();

    // Send email with credentials
    await sendCoordinatorCredentials(coordinator, password);

    res.status(201).json({ 
      message: 'Coordinator registered successfully and credentials sent via email', 
      coordinatorId: coordinator._id 
    });
  } catch (error) {
    logger.error('Error registering coordinator', { error: error.message });
    res.status(500).json({ error: 'Internal server error while registering coordinator' });
  }
});

// Email sending function

const sendCoordinatorCredentials = async (coordinator, temporaryPassword) => {
  try {

    const emailTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #333; text-align: center; margin-bottom: 30px;">Welcome to the Platform!</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">Dear ${coordinator.name},</p>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            You have been successfully registered as a Coordinator. Below are your account details and credentials:
          </p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px;">Account Details:</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-weight: bold; width: 40%;">Name:</td>
                <td style="padding: 8px 0; color: #333;">${coordinator.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
                <td style="padding: 8px 0; color: #333;">${coordinator.email}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-weight: bold;">Phone Number:</td>
                <td style="padding: 8px 0; color: #333;">${coordinator.phoneNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-weight: bold;">College:</td>
                <td style="padding: 8px 0; color: #333;">${coordinator.college}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-weight: bold;">Year:</td>
                <td style="padding: 8px 0; color: #333;">${coordinator.year}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-weight: bold;">GitHub:</td>
                <td style="padding: 8px 0; color: #333;">${coordinator.github}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-weight: bold;">LinkedIn:</td>
                <td style="padding: 8px 0; color: #333;">${coordinator.linkedin}</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #e3f2fd; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2196f3;">
            <h3 style="color: #1976d2; margin-bottom: 15px;">Login Credentials:</h3>
            <p style="color: #333; margin: 5px 0;"><strong>Username:</strong> ${coordinator.email}</p>
            <p style="color: #333; margin: 5px 0;"><strong>Temporary Password:</strong> ${temporaryPassword}</p>
            <p style="color: #856404; font-size: 13px; margin-top: 8px;">⚠️ Please change your password immediately after first login.</p>
          </div>
          
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="color: #856404; margin: 0; font-size: 14px;">
              <strong>Important:</strong> Please change your password after your first login for security purposes.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Please login to your account and complete your profile setup.
            </p>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #888; font-size: 14px; text-align: center; margin: 0;">
            If you have any questions or need assistance, please contact our support team.
          </p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: coordinator.email,
      subject: 'Welcome! Your Coordinator Account Credentials',
      html: emailTemplate,
    };

    await transporter.sendMail(mailOptions);
    logger.info('Coordinator credentials email sent', { email: coordinator.email });
  } catch (error) {
    logger.error('Failed to send coordinator credentials email', { error: error.message });
    throw error;
  }
};



// Login Routes
router.post('/student/login', async (req,res) => {
 try {
   const {email,password} = req.body;

   const student=await Student.findOne({email});
   if(!student){
     return res.status(401).json({message:'Invalid email or password'});
   }

   const isValidPassword=await bcrypt.compare(password ,student.password);
   if(!isValidPassword){
     return res.status(401).json({message:'Invalid email or password'});
   }

   const token = signToken({ userId: student._id, role: 'student' });
   // Never return the full student object — exclude sensitive fields
   const { password: _pw, otp: _otp, otpExpiry: _exp, ...safeStudent } = student.toObject();
   res.json({ token, role: 'student', student: safeStudent });
 } catch (error) {
   logger.error('Student login error', { error: error.message });
   res.status(500).json({ error: 'Internal server error' });
 }
});

// Mentor Login Route
router.post('/mentor/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the mentor by email
    const mentor = await Mentor.findOne({ email });

    // Check if the mentor exists
    if (!mentor) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if the mentor's status is approved
    if (mentor.status !== 'approved') {
      return res.status(403).json({ message: 'Your account is not approved yet. Please wait for approval from the administrator.' });
    }

    // Compare the password
    const isValidPassword = await bcrypt.compare(password, mentor.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = signToken({ userId: mentor._id, role: 'mentor' });
    res.json({ token, role: 'mentor', mentor: mentor._id });
  } catch (error) {
    logger.error('Mentor login error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Coordinator Login
router.post('/coordinator/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const coordinator = await Coordinator.findOne({ email });
    if (!coordinator) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const isValidPassword = await bcrypt.compare(password, coordinator.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = signToken({ userId: coordinator._id, role: 'coordinator' });
    const { password: _pw, otp: _otp, otpExpiry: _exp, ...safeCoord } = coordinator.toObject();
    res.json({ token, role: 'coordinator', coordinatordetails: safeCoord });
  } catch (error) {
    logger.error('Coordinator login error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin Login Route
// Step 1: Verify credentials and send OTP
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 300000); // 5 minutes from now
    
    // Save OTP in database
    admin.otp = otp;
    admin.otpExpiry = otpExpiry;
    await admin.save();

    // Send OTP via email
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Login OTP',
      text: `Your OTP for login is: ${otp}`
    });
    
    res.json({ message: 'OTP sent successfully', role: 'admin', requireOTP: true });
  } catch (error) {
    logger.error("Admin Login Error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Step 2: Verify OTP and complete login
router.post('/admin/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Check if OTP is valid and not expired
    if (!admin.otp || admin.otp !== otp || !admin.otpExpiry || new Date() > admin.otpExpiry) {
      return res.status(401).json({ message: 'Invalid or expired OTP' });
    }

    const token = signToken({ userId: admin._id, role: 'admin' });
    // Clear OTP fields after successful verification
    admin.otp = null;
    admin.otpExpiry = null;
    await admin.save();
    logger.info('Admin OTP verified, login successful', { adminId: admin._id });
    res.json({ token, admin: admin._id.toString() });
  } catch (error) {
    logger.error("OTP Verification Error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password with old password
router.post('/admin/reset-password', async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;

    if (!email || !oldPassword || !newPassword) {
      return res.status(400).json({ message: "Missing input fields" });
    }

    // Find the user by email
    const admin = await Admin.findOne({ email }); 
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Check if old password is correct
    const isValidPassword = await bcrypt.compare(oldPassword, admin.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid old password" });
    }

    // Hash and save the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    await admin.save();

    logger.info("Admin password updated successfully", { email });
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    logger.error("Admin password reset error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password with OTP
router.post('/admin/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    logger.info(`Processing forgot password for admin`, { email });
    
    const admin = await Admin.findOne({ email });
    
    if (!admin) {
      logger.warn(`Admin not found with email: ${email}`);
      return res.status(404).json({ message: "Email not found!" });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 600000); // 10 minutes from now
    
    logger.info(`OTP generated for admin`, { adminId: admin._id, expiresAt: otpExpiry });

    // Store OTP in database
    admin.otp = otp;
    admin.otpExpiry = otpExpiry;
    
    try {
      const savedAdmin = await admin.save();
      logger.info('Admin OTP saved', { adminId: savedAdmin._id, hasOtp: !!savedAdmin.otp });
    } catch (saveError) {
      logger.error('Error saving admin OTP', { error: saveError.message });
      return res.status(500).json({ message: "Failed to save OTP. Database error." });
    }

    // Send OTP via email
    try {
      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Password Reset OTP',
        text: `Your OTP for password reset is: ${otp}\n\nThis OTP expires in 10 minutes.`,
      });
      logger.info('Admin forgot-password OTP sent', { adminId: admin._id });
      res.json({ message: 'OTP sent to your email!' });
    } catch (emailError) {
      logger.error('Failed to send admin OTP email', { error: emailError.message });
      admin.otp = undefined;
      admin.otpExpiry = undefined;
      await admin.save();
      res.status(500).json({ message: 'Failed to send OTP email. Please try again later.' });
    }
  } catch (error) {
    logger.error("Forgot Password Error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/validate-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const admin = await Admin.findOne({ email });
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Check if OTP is valid and not expired
    if (!admin.otp || admin.otp !== otp || !admin.otpExpiry || new Date() > admin.otpExpiry) {
      return res.status(401).json({ message: 'Invalid or expired OTP' });
    }

    res.json({ message: 'OTP validated successfully!' });
  } catch (error) {
    logger.error("OTP Validation Error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/reset-forgot-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    
    // Check if OTP was validated (presence of OTP fields)
    if (!admin.otp || !admin.otpExpiry) {
      return res.status(400).json({ message: "OTP validation required before password reset" });
    }

    // Hash and save the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    
    // Clear OTP fields after password reset
    admin.otp = undefined;
    admin.otpExpiry = undefined;
    
    await admin.save();
    logger.info("Admin password reset via OTP successful", { email });
    res.json({ message: "Password reset successfully!" });
  } catch (error) {
    logger.error("Password Reset Error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Reset Password Routes
// Student password reset routes
router.post('/student/reset-password', async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;

    if (!email || !oldPassword || !newPassword) {
      return res.status(400).json({ message: "Missing input fields" });
    }

    const user = await Student.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isValidPassword = await bcrypt.compare(oldPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid old password" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    logger.info("Student password reset successful", { email });
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    logger.error("Student password reset error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/student/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await Student.findOne({ email });
    
    if (!user) {
      return res.status(404).json({ message: "Email not found!" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 600000); // 10 minutes expiry
    
    // Store OTP in database
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();
    
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}\n\nThis OTP expires in 10 minutes.`,
    });
    logger.info('Student forgot-password OTP sent', { studentId: user._id });
    res.json({ message: 'OTP sent to your email!' });
  } catch (error) {
    logger.error("Student forgot password error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/student/validate-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await Student.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if OTP exists and is valid
    if (!user.otp || user.otp !== otp || Date.now() > user.otpExpiry) {
      return res.status(401).json({ message: 'Invalid or expired OTP' });
    }

    res.json({ message: 'OTP validated successfully!' });
  } catch (error) {
    logger.error("Student OTP validation error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/student/reset-forgot-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const user = await Student.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if OTP was validated
    if (!user.otp || !user.otpExpiry || Date.now() > user.otpExpiry) {
      return res.status(401).json({ message: "OTP validation required or expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    
    // Clear OTP after successful password reset
    user.otp = null;
    user.otpExpiry = null;
    
    await user.save();
    logger.info("Student password reset via OTP successful", { email });
    res.json({ message: "Password reset successfully!" });
  } catch (error) {
    logger.error("Student password reset via OTP error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mentor password reset routes
router.post('/mentor/reset-password', async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;

    if (!email || !oldPassword || !newPassword) {
      return res.status(400).json({ message: "Missing input fields" });
    }

    const mentor = await Mentor.findOne({ email });
    if (!mentor) {
      return res.status(404).json({ message: "Mentor not found" });
    }

    const isValidPassword = await bcrypt.compare(oldPassword, mentor.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid old password" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    mentor.password = hashedPassword;
    await mentor.save();

    logger.info("Mentor password updated successfully", { email });
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    logger.error("Mentor password reset error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/mentor/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const mentor = await Mentor.findOne({ email });
    
    if (!mentor) {
      return res.status(404).json({ message: "Email not found!" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 600000); // 10 minutes expiry
    
    // Store OTP in database
    mentor.otp = otp;
    mentor.otpExpiry = otpExpiry;
    await mentor.save();
    
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}\n\nThis OTP expires in 10 minutes.`,
    });
    logger.info('Mentor forgot-password OTP sent', { mentorId: mentor._id });
    res.json({ message: 'OTP sent to your email!' });
  } catch (error) {
    logger.error("Mentor forgot password error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/mentor/validate-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const mentor = await Mentor.findOne({ email });
    if (!mentor) {
      return res.status(404).json({ message: "Mentor not found" });
    }

    // Check if OTP exists and is valid
    if (!mentor.otp || mentor.otp !== otp || Date.now() > mentor.otpExpiry) {
      return res.status(401).json({ message: 'Invalid or expired OTP' });
    }

    res.json({ message: 'OTP validated successfully!' });
  } catch (error) {
    logger.error("Mentor OTP validation error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/mentor/reset-forgot-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const mentor = await Mentor.findOne({ email });

    if (!mentor) {
      return res.status(404).json({ message: "Mentor not found" });
    }

    // Check if OTP was validated
    if (!mentor.otp || !mentor.otpExpiry || Date.now() > mentor.otpExpiry) {
      return res.status(401).json({ message: "OTP validation required or expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    mentor.password = hashedPassword;
    
    // Clear OTP after successful password reset
    mentor.otp = null;
    mentor.otpExpiry = null;
    
    await mentor.save();
    logger.info("Mentor password reset via OTP successful", { email });
    res.json({ message: "Password reset successfully!" });
  } catch (error) {
    logger.error("Mentor password reset via OTP error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Coordinator CRUD operations

// Get all coordinators
router.get('/coordinator', async (req, res) => {
  try {
    const coordinators = await Coordinator.find();
    res.json(coordinators);
  } catch (error) {
    logger.error("Error getting coordinators", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get coordinator by ID
router.get('/coordinator/:id', async (req, res) => {
  try {
    const coordinator = await Coordinator.findById(req.params.id);
    if (!coordinator) return res.status(404).json({ error: 'Coordinator not found' });
    res.json(coordinator);
  } catch (error) {
    logger.error("Error getting coordinator by ID", { error: error.message, id: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update coordinator by ID
router.put('/coordinator/:id', async (req, res) => {
  try {
    const { name, email, phoneNumber, college, year, github, linkedin } = req.body;
    // Validate college and year if provided
    const validColleges = ['KIET', 'KIET+', 'KIEW'];
    const validYears = ['first year', 'second year', 'third year', 'fourth year'];
    if (college && !validColleges.includes(college)) {
      return res.status(400).json({ error: 'Invalid college selection' });
    }
    if (year && !validYears.includes(year)) {
      return res.status(400).json({ error: 'Invalid year selection' });
    }
    const update = { name, email, phoneNumber, college, year, github, linkedin };
    // Remove undefined fields
    Object.keys(update).forEach(key => update[key] === undefined && delete update[key]);
    const coordinator = await Coordinator.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!coordinator) return res.status(404).json({ error: 'Coordinator not found' });
    res.json({ message: 'Coordinator updated successfully', coordinator });
  } catch (error) {
    logger.error("Error updating coordinator", { error: error.message, id: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete coordinator by ID
router.delete('/coordinator/:id', async (req, res) => {
  try {
    const coordinator = await Coordinator.findByIdAndDelete(req.params.id);
    if (!coordinator) return res.status(404).json({ error: 'Coordinator not found' });
    res.json({ message: 'Coordinator deleted successfully' });
  } catch (error) {
    logger.error("Error deleting coordinator", { error: error.message, id: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Coordinator password reset routes
router.post('/coordinator/reset-password', async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;
    if (!email || !oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Missing input fields' });
    }
    const coordinator = await Coordinator.findOne({ email });
    if (!coordinator) {
      return res.status(404).json({ message: 'Coordinator not found' });
    }
    const isValidPassword = await bcrypt.compare(oldPassword, coordinator.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid old password' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    coordinator.password = hashedPassword;
    await coordinator.save();
    logger.info("Coordinator password updated successfully", { email });
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error("Coordinator password reset error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/coordinator/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const coordinator = await Coordinator.findOne({ email });
    if (!coordinator) {
      return res.status(404).json({ message: 'Email not found!' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 600000); // 10 minutes expiry
    coordinator.otp = otp;
    coordinator.otpExpiry = otpExpiry;
    await coordinator.save();
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}\n\nThis OTP expires in 10 minutes.`,
    });
    logger.info('Coordinator forgot-password OTP sent', { coordinatorId: coordinator._id });
    res.json({ message: 'OTP sent to your email!' });
  } catch (error) {
    logger.error("Coordinator forgot password error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/coordinator/validate-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const coordinator = await Coordinator.findOne({ email });
    if (!coordinator) {
      return res.status(404).json({ message: 'Coordinator not found' });
    }
    if (!coordinator.otp || coordinator.otp !== otp || Date.now() > coordinator.otpExpiry) {
      return res.status(401).json({ message: 'Invalid or expired OTP' });
    }
    res.json({ message: 'OTP validated successfully!' });
  } catch (error) {
    logger.error("Coordinator validate-otp error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/coordinator/reset-forgot-password', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const coordinator = await Coordinator.findOne({ email });
    if (!coordinator) {
      return res.status(404).json({ message: 'Coordinator not found' });
    }
    if (!coordinator.otp || !coordinator.otpExpiry || Date.now() > coordinator.otpExpiry) {
      return res.status(401).json({ message: 'OTP validation required or expired' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    coordinator.password = hashedPassword;
    coordinator.otp = null;
    coordinator.otpExpiry = null;
    await coordinator.save();
    logger.info("Coordinator password reset via OTP successful", { email });
    res.json({ message: 'Password reset successfully!' });
  } catch (error) {
    logger.error("Password reset verification error", { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;