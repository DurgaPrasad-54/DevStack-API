const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
// Import the models
const { Student, Mentor, Admin } = require('../models/roles');

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    
    try {
        const decoded = jwt.verify(token, 'your-secret-key');
        req.user = decoded;
        next();
    } catch (error) {
        res.status(400).json({ message: 'Invalid token.' });
    }
};

// Student Profile Route
router.get('/student/profile', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'Access denied. Not a student.' });
        }
        
        const student = await Student.findById(req.user.userId)
            .select('-password -__v');  // Exclude password and version key
        
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }
        
        res.json(student);
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
});

// Mentor Profile Route
router.get('/mentor/profile', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'mentor') {
            return res.status(403).json({ message: 'Access denied. Not a mentor.' });
        }
        
        const mentor = await Mentor.findById(req.user.userId)
            .select('-password -__v');
        
        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found.' });
        }
        
        res.json(mentor);
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
});

// Admin Profile Route
router.get('/admin/profile', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Not an admin.' });
        }
        
        const admin = await Admin.findById(req.user.userId)
            .select('-password -__v');
        
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found.' });
        }
        
        res.json(admin);
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
});

// Update Student Profile Route
router.put('/student/profile', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'student') {
            return res.status(403).json({ message: 'Access denied. Not a student.' });
        }
        
        const updates = req.body;
        delete updates.password; // Prevent password update through this route
        
        const student = await Student.findByIdAndUpdate(
            req.user.userId,
            { $set: updates },
            { new: true }
        ).select('-password -__v');
        
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }
        
        res.json(student);
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
});

// Update Mentor Profile Route
router.put('/mentor/profile', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'mentor') {
            return res.status(403).json({ message: 'Access denied. Not a mentor.' });
        }

        const updates = req.body;
        delete updates.password; // Prevent password update through this route

        const mentor = await Mentor.findByIdAndUpdate(
            req.user.userId,
            { $set: updates },
            { new: true }
        ).select('-password -__v');

        if (!mentor) {
            return res.status(404).json({ message: 'Mentor not found.' });
        }

        res.json(mentor);
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
});

// Update Admin Profile Route
router.put('/admin/profile', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Not an admin.' });
        }

        const updates = req.body;
        delete updates.password; // Prevent password update through this route

        const admin = await Admin.findByIdAndUpdate(
            req.user.userId,
            { $set: updates },
            { new: true }
        ).select('-password -__v');

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found.' });
        }

        res.json(admin);
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
});

module.exports = router;