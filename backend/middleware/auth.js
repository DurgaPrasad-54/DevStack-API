const jwt = require('jsonwebtoken');

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
        
        // DEBUG: Log decoded token for troubleshooting
        console.log('[AUTH] Token decoded:', {
            userId: decoded.userId || decoded.id || decoded._id,
            role: decoded.role || decoded.userRole || decoded.type,
            hasRole: !!(decoded.role || decoded.userRole || decoded.type)
        });
        
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
            code: 'INVALID_TOKEN',
            error: error.message
        });
    }
};

// New middleware function to retrieve student ID from token
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
        req.studentId = user.userId || user.id || user._id; // Ensure the token contains the userId
        req.user = user; // Also set req.user for consistency
        next();
    });
};

// Enhanced role-based middleware with better error handling and multiple field support
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            console.log('[AUTH] Role check failed: No user in request');
            return res.status(401).json({ 
                message: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }

        // Check multiple possible role field names for flexibility
        const userRole = req.user.role || req.user.userRole || req.user.type;
        
        console.log('[AUTH] Role check:', {
            requiredRoles: roles,
            userRole: userRole,
            tokenFields: Object.keys(req.user),
            userId: req.user.userId || req.user.id || req.user._id
        });

        // If no role found in token, provide detailed error
        if (!userRole) {
            console.log('[AUTH] Role check failed: No role field in token');
            return res.status(403).json({ 
                message: 'Access denied. No role information in token.',
                code: 'NO_ROLE_IN_TOKEN',
                debug: process.env.NODE_ENV === 'development' ? {
                    tokenFields: Object.keys(req.user),
                    hint: 'Token must include role, userRole, or type field'
                } : undefined
            });
        }

        // Check if user's role is in allowed roles
        if (!roles.includes(userRole)) {
            console.log('[AUTH] Role check failed: Insufficient permissions');
            return res.status(403).json({ 
                message: 'Access denied. Insufficient permissions.',
                code: 'INSUFFICIENT_PERMISSIONS',
                debug: process.env.NODE_ENV === 'development' ? {
                    required: roles,
                    actual: userRole
                } : undefined
            });
        }

        console.log('[AUTH] Role check passed:', userRole);
        next();
    };
};

// Optional: Middleware to normalize user object for consistency
const normalizeUser = (req, res, next) => {
    if (req.user) {
        // Normalize userId
        if (!req.user.userId) {
            req.user.userId = req.user.id || req.user._id;
        }
        
        // Normalize role
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