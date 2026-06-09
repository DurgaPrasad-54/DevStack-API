const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

const authenticateToken = (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                message: 'Access denied. No token provided.',
                code: 'NO_TOKEN'
            });
        }

        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                message: 'Token expired. Please login again.',
                code: 'TOKEN_EXPIRED'
            });
        }
        res.status(400).json({
            message: 'Invalid token.',
            code: 'INVALID_TOKEN'
        });
    }
};

// Middleware to retrieve student ID from token
const authenticateStudentToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({
            message: 'Access denied. No token provided.',
            code: 'NO_TOKEN'
        });
    }

    jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({
                message: 'Invalid or expired token.',
                code: 'INVALID_TOKEN'
            });
        }
        req.studentId = user.userId || user.id || user._id;
        req.user = user;
        next();
    });
};

// Role-based middleware with proper error handling
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                message: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }

        const userRole = req.user.role || req.user.userRole || req.user.type;

        if (!userRole) {
            return res.status(403).json({
                message: 'Access denied. No role information in token.',
                code: 'NO_ROLE_IN_TOKEN',
                debug: process.env.NODE_ENV === 'development' ? {
                    tokenFields: Object.keys(req.user),
                    hint: 'Token must include role, userRole, or type field'
                } : undefined
            });
        }

        if (!roles.includes(userRole)) {
            logger.warn('Insufficient permissions', {
                required: roles,
                actual: userRole,
                path: req.path,
            });
            return res.status(403).json({
                message: 'Access denied. Insufficient permissions.',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }

        next();
    };
};

// Middleware to normalize user object for consistency
const normalizeUser = (req, res, next) => {
    if (req.user) {
        if (!req.user.userId) {
            req.user.userId = req.user.id || req.user._id;
        }
        if (!req.user.role) {
            req.user.role = req.user.userRole || req.user.type;
        }
    }
    next();
};

module.exports = {
    authenticateToken,
    authenticateStudentToken,
    requireRole,
    normalizeUser
};