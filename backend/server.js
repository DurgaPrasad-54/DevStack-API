const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');

// Load environment variables FIRST
dotenv.config();

// Internal imports
const Chat = require('./models/chat');
const HackNotification = require('./Devstack/models/HackNotification');
const { startHackathonStatusScheduler } = require('./Devstack/scheduler/hackathonStatusScheduler');
const { requestLogger, morganStream, logger } = require('./utils/logger');
const { errorHandler, notFound } = require('./utils/errorHandler');

// ─── Route imports ──────────────────────────────────────────────────────────
const UserRoutes           = require('./routes/roles');
const csvRoutes            = require('./routes/studentcsv');
const hackathon            = require('./Devstack/routes/Adminhackathon');

// ─── App & Server setup ──────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ─── CORS configuration ──────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'http://localhost:3001',
];

const checkOrigin = (origin, callback) => {
  const isLocalhost = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!origin || allowedOrigins.includes(origin) || isLocalhost) {
    callback(null, true);
  } else if (process.env.NODE_ENV !== 'production') {
    callback(null, true);
  } else {
    callback(new Error('CORS policy violation'));
  }
};

const corsOptions = {
  origin: checkOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ─── Socket.IO setup ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: checkOrigin,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
  },
  // Recommended for PM2 cluster mode with sticky sessions
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── Core Middleware (ORDER MATTERS) ─────────────────────────────────────────

// 1. Security headers (helmet)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin images
  contentSecurityPolicy: false, // Disable CSP here; set per-route if needed
}));

// 2. Compression (must be before routes)
app.use(compression({ level: 6, threshold: 1024 }));

// 3. CORS
app.use(cors(corsOptions));

// 4. Body parsing with limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 5. HTTP request logging
app.use(morgan('combined', { stream: morganStream }));

// 6. Attach io to app for use in routes
app.set('io', io);

// ─── Global Rate Limiters ─────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Max 20 login attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
  skipSuccessfulRequests: true, // Only count failed attempts
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Max 5 OTP attempts
  message: { success: false, message: 'Too many OTP attempts, please request a new OTP.' },
});

app.use(globalLimiter);

// ─── Health Check Endpoint ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';

  res.json({
    status: dbState === 1 ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: { status: dbStatus },
    activeConnections: io ? io.engine.clientsCount : 0,
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
    },
  });
});

// ─── MongoDB Connection ──────────────────────────────────────────────────────
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL, {
      maxPoolSize: 20,          // Connection pool for 1000+ users
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 10000,
    });
    logger.info('MongoDB connected');
    startHackathonStatusScheduler();
  } catch (err) {
    logger.error('MongoDB connection failed', { error: err.message });
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected — attempting reconnect');
});
mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});

connectDB();

// ─── Socket.IO Authentication ────────────────────────────────────────────────
const connectedUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication token missing'));

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    socket.userId   = decoded.userId;
    socket.userRole = decoded.role;
    next();
  } catch (error) {
    logger.warn('Socket auth failed', { error: error.message });
    next(new Error('Invalid or expired token'));
  }
});

// ─── Socket.IO Connection Handler ────────────────────────────────────────────
io.on('connection', (socket) => {
  logger.info('Socket connected', { userId: socket.userId, socketId: socket.id, role: socket.userRole });

  // Track connections per user (supports multiple devices)
  if (!connectedUsers.has(socket.userId)) {
    connectedUsers.set(socket.userId, new Set());
  }
  connectedUsers.get(socket.userId).add(socket.id);

  // Room-based architecture: user room + role room
  socket.join(`user:${socket.userId}`);
  socket.join(`role:${socket.userRole}`);

  socket.emit('connected', { userId: socket.userId, socketId: socket.id });

  // ── sendMessage ─────────────────────────────────────────────────────────
  socket.on('sendMessage', async (data, callback) => {
    try {
      if (!data?.chatId || !data?.message?.content) {
        throw new Error('Invalid message data');
      }

      const chat = await Chat.findById(data.chatId).lean(false);
      if (!chat) throw new Error('Chat not found');

      const capitalizedRole = socket.userRole.charAt(0).toUpperCase() + socket.userRole.slice(1).toLowerCase();

      const newMessage = {
        sender:      socket.userId,
        senderModel: capitalizedRole,
        content:     data.message.content,
        timestamp:   new Date(),
      };

      chat.messages.push(newMessage);
      chat.lastMessage = new Date();
      await chat.save();

      // Emit to all participants via their user rooms
      for (const participant of chat.participants) {
        io.to(`user:${participant.user.toString()}`).emit('newMessage', {
          chatId:  chat._id,
          message: newMessage,
        });
      }

      if (callback) callback({ success: true });
    } catch (error) {
      logger.error('Socket sendMessage error', { error: error.message, userId: socket.userId });
      if (callback) callback({ error: 'Message delivery failed' }); // Don't expose internals
    }
  });

  // ── markAsRead ──────────────────────────────────────────────────────────
  socket.on('markAsRead', async (notificationId) => {
    try {
      await HackNotification.findByIdAndUpdate(notificationId, {
        $addToSet: { readBy: socket.userId },
      });
      io.to(`user:${socket.userId}`).emit('notificationRead', { notificationId });
    } catch (error) {
      logger.error('markAsRead error', { error: error.message });
    }
  });

  // ── markHackAsRead ──────────────────────────────────────────────────────
  socket.on('markHackAsRead', async (hackNotificationId) => {
    try {
      await HackNotification.findByIdAndUpdate(hackNotificationId, {
        $addToSet: { readBy: socket.userId },
      });
      io.to(`user:${socket.userId}`).emit('hackNotificationRead', { hackNotificationId });
    } catch (error) {
      logger.error('markHackAsRead error', { error: error.message });
    }
  });

  // ── disconnect ──────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    logger.info('Socket disconnected', { userId: socket.userId, socketId: socket.id, reason });

    if (connectedUsers.has(socket.userId)) {
      connectedUsers.get(socket.userId).delete(socket.id);
      if (connectedUsers.get(socket.userId).size === 0) {
        connectedUsers.delete(socket.userId);
      }
    }
  });
});

// ─── API Routes ──────────────────────────────────────────────────────────────

// Auth routes get rate-limited
app.use('/roles', authLimiter, UserRoutes);

// Other routes
app.use('/csv',                csvRoutes);

// Hackathon routes
app.use('/hackathon',          hackathon);
app.use('/hacknotifications',  require('./Devstack/routes/HackNotification'));
app.use('/roomallocation',     require('./Devstack/routes/roomallocation'));
app.use('/schedule',           require('./Devstack/routes/schedule'));
app.use('/hackreg',            require('./Devstack/routes/hack-reg'));
app.use('/hackitems',          require('./Devstack/routes/Hackitems'));
app.use('/hacknotes',          require('./Devstack/routes/Hacknotes'));
app.use('/hackvideos',         require('./Devstack/routes/Hackvideos'));
app.use('/hackvideofolder',    require('./Devstack/routes/Hackvideofolder'));
app.use('/hackfolder',         require('./Devstack/routes/Hackfolder'));
app.use('/hackathonrequests',  require('./Devstack/routes/Hackmentor'));
app.use('/hackteams',          require('./Devstack/routes/hackteam'));
app.use('/problemstatements',  require('./Devstack/routes/problemstatements'));
app.use('/studenthackteam',    require('./Devstack/routes/studenthackteam'));
app.use('/teamprogress',       require('./Devstack/routes/teamprogress'));
app.use('/hacksubmission',     require('./Devstack/routes/hacksubmission'));
app.use('/hackmentorfeedback', require('./Devstack/routes/hackfeedbackmentor'));
app.use('/hackathonattendance',require('./Devstack/routes/hackathonattendance'));
app.use('/mentorevaluation',   require('./Devstack/routes/mentorEvaluation'));
app.use('/api/hackathon/gallery', require('./Devstack/routes/hackGallery'));
app.use('/winners',            require('./Devstack/routes/Winners'));
app.use('/hackcertificates',   require('./Devstack/routes/HackCertificate'));
app.use('/hackathon-history',  require('./Devstack/routes/hackathonHistory'));
app.use('/mentor-hackathon-history', require('./Devstack/routes/mentorHackathonHistory'));

// ─── Error Handling (must be LAST) ──────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Server Startup ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, { env: process.env.NODE_ENV, port: PORT });
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
const shutdown = async (signal) => {
  logger.info(`${signal} received — beginning graceful shutdown`);

  server.close(async () => {
    logger.info('HTTP server closed');

    // Close all Socket.IO connections
    io.close(() => logger.info('Socket.IO closed'));

    // Close MongoDB connection
    try {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
    } catch (err) {
      logger.error('Error closing MongoDB', { error: err.message });
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
  });

  // Force kill after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException',  (err) => { logger.error('Uncaught exception', { error: err.message, stack: err.stack }); process.exit(1); });
process.on('unhandledRejection', (reason) => { logger.error('Unhandled rejection', { reason: String(reason) }); process.exit(1); });

module.exports = { app, server, io };
