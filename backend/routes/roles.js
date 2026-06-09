const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Import Models
const { Student, Mentor, Admin } = require('../models/roles');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ADMIN_USER,
    pass: process.env.ADMIN_PASS
  }
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
    
    // Log the incoming request body
    console.log("Student Signup Request Body:", req.body);
    
    // Validation for required fields
    if (!name || !email || !phoneNumber || !password || !rollNo || !branch || !year || !currentYear || !college) {
      return res.status(400).json({ 
        error: 'All required fields must be provided' 
      });
    }

    // Validate currentYear enum
    const validCurrentYears = ['first year', 'second year', 'third year', 'fourth year', 'alumni'];
    if (!validCurrentYears.includes(currentYear)) {
      return res.status(400).json({ 
        error: 'Invalid current year selection' 
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
    
    console.log("Student registered successfully:", {
      id: student._id,
      name: student.name,
      email: student.email,
      currentYear: student.currentYear
    });
    
    res.status(201).json({ 
      message: 'Student registered successfully',
      studentId: student._id
    });
    
  } catch (error) {
    console.error("Student Signup Error:", error);
    
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

    // Log the incoming request body
    console.log("Mentor Signup Request Body:", req.body);

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
    console.error("Mentor Signup Error:", error);
    res.status(500).json({error: error.message});
  }
});

// Admin Signup Route
router.post('/admin/signup', async (req,res) => {
 try {
   const {name,email,phoneNumber,password} = req.body;

   const hashedPassword=await bcrypt.hash(password ,10);

   const admin=new Admin({
     name,
     email,
     phoneNumber,
     password : hashedPassword
   });

   await admin.save();
   res.status(201).json({message:'Admin registered successfully'});
 } catch(error){
   res.status(500).json({error:error.message});
 }
});

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

   const token=jwt.sign({userId : student._id , role : 'student'}, 'your-secret-key',{expiresIn:'1h'});
   res.json({token,student:student._id,studentyear:student.currentYear});
 } catch(error){
   res.status(500).json({error:error.message});
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

    // Create the JWT token
    const token = jwt.sign(
      { userId: mentor._id, role: 'mentor' },
      'your-secret-key',
      { expiresIn: '1h' }
    );

    // Send the token in response
    res.json({ token,role: 'mentor', mentor: mentor._id });
  } catch (error) {
    console.error("Mentor Login Error:", error);
    res.status(500).json({ error: error.message });
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
      from: process.env.EMAIL,
      to: email,
      subject: 'Login OTP',
      text: `Your OTP for login is: ${otp}`
    });
    
    res.json({ message: 'OTP sent successfully', requireOTP: true });
  } catch (error) {
    console.error("Admin Login Error:", error);
    res.status(500).json({ error: error.message });
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

    // Create JWT token
    const token = jwt.sign(
      { userId: admin._id, role: 'admin' },
      'your-secret-key',
      { expiresIn: '1h' }
    );
    
    // Clear OTP fields after successful verification
    admin.otp = null;
    admin.otpExpiry = null;
    await admin.save();

    res.json({ token, admin: admin._id.toString() });
  } catch (error) {
    console.error("OTP Verification Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Change password with old password
router.post('/admin/reset-password', async (req, res) => {
  try {
    console.log("Request Body:", req.body);
    const { email, oldPassword, newPassword } = req.body;

    if (!email || !oldPassword || !newPassword) {
      console.log("Missing input fields");
      return res.status(400).json({ message: "Missing input fields" });
    }

    // Find the user by email
    const admin = await Admin.findOne({ email }); 
    if (!admin) {
      console.log("Admin not found");
      return res.status(404).json({ message: "Admin not found" });
    }

    // Check if old password is correct
    const isValidPassword = await bcrypt.compare(oldPassword, admin.password);
    if (!isValidPassword) {
      console.log("Invalid old password");
      return res.status(401).json({ message: "Invalid old password" });
    }

    // Hash and save the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    await admin.save();

    console.log("Password updated successfully");
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reset password with OTP
// Reset password with OTP - Fixed version
router.post('/admin/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Add some logging to trace execution
    console.log(`Processing forgot password for admin email: ${email}`);
    
    const admin = await Admin.findOne({ email });
    
    if (!admin) {
      console.log(`Admin not found with email: ${email}`);
      return res.status(404).json({ message: "Email not found!" });
    }

    console.log(`Found admin: ${admin._id}`);

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 600000); // 10 minutes from now
    
    console.log(`Generated OTP: ${otp} with expiry: ${otpExpiry}`);
    
    // Store OTP in database - explicitly set the fields
    admin.otp = otp;
    admin.otpExpiry = otpExpiry;
    
    // Add detailed logging for save operation
    try {
      const savedAdmin = await admin.save();
      console.log(`Admin saved with OTP. Updated document:`, {
        id: savedAdmin._id,
        email: savedAdmin.email,
        hasOtp: !!savedAdmin.otp,
        otpValue: savedAdmin.otp,
        otpExpiry: savedAdmin.otpExpiry
      });
    } catch (saveError) {
      console.error("Error saving admin with OTP:", saveError);
      return res.status(500).json({ message: "Failed to save OTP. Database error." });
    }

    // Send OTP via email
    try {
      await transporter.sendMail({
        from: process.env.EMAIL,
        to: email,
        subject: 'Password Reset OTP',
        text: `Your OTP for password reset is: ${otp}`
      });
      
      console.log(`Email sent successfully to ${email}`);
      res.json({ message: "OTP sent to your email!" });
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
      // Revert the OTP save if email fails
      admin.otp = undefined;
      admin.otpExpiry = undefined;
      await admin.save();
      
      res.status(500).json({ message: "Failed to send OTP email. Please try again later." });
    }
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ error: error.message });
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
    console.error("OTP Validation Error:", error);
    res.status(500).json({ error: error.message });
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

    res.json({ message: "Password reset successfully!" });
  } catch (error) {
    console.error("Password Reset Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// User Reset Password Routes
// Student password reset routes
router.post('/student/reset-password', async (req, res) => {
  try {
    console.log("Request Body:", req.body);
    const { email, oldPassword, newPassword } = req.body;

    if (!email || !oldPassword || !newPassword) {
      console.log("Missing input fields");
      return res.status(400).json({ message: "Missing input fields" });
    }

    const user = await Student.findOne({ email });
    if (!user) {
      console.log("User not found");
      return res.status(404).json({ message: "User not found" });
    }

    const isValidPassword = await bcrypt.compare(oldPassword, user.password);
    if (!isValidPassword) {
      console.log("Invalid old password");
      return res.status(401).json({ message: "Invalid old password" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    console.log("Password updated successfully");
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
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
      from: process.env.EMAIL,
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}`
    });
    res.json({ message: "OTP sent to your email!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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

    res.json({ message: "Password reset successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mentor password reset routes
router.post('/mentor/reset-password', async (req, res) => {
  try {
    console.log("Request Body:", req.body);
    const { email, oldPassword, newPassword } = req.body;

    if (!email || !oldPassword || !newPassword) {
      console.log("Missing input fields");
      return res.status(400).json({ message: "Missing input fields" });
    }

    const mentor = await Mentor.findOne({ email });
    if (!mentor) {
      console.log("Mentor not found");
      return res.status(404).json({ message: "Mentor not found" });
    }

    const isValidPassword = await bcrypt.compare(oldPassword, mentor.password);
    if (!isValidPassword) {
      console.log("Invalid old password");
      return res.status(401).json({ message: "Invalid old password" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    mentor.password = hashedPassword;
    await mentor.save();

    console.log("Password updated successfully");
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
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
      from: process.env.EMAIL,
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}`
    });
    res.json({ message: "OTP sent to your email!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    res.status(500).json({ error: error.message });
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

    res.json({ message: "Password reset successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;