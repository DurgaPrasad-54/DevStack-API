const jwt = require('jsonwebtoken');
const { logger } = require('./logger');

/**
 * Socket.IO Manager for scalable implementation
 * - Uses rooms for broadcasts
 * - Prevents duplicate listeners
 * - Automatic cleanup on disconnect
 * - Redis adapter ready
 */
class SocketManager {
  constructor(io) {
    this.io = io;
    this.userSockets = new Map(); // { userId: Set of socket IDs }
    this.socketUsers = new Map();  // { socketId: userId }
    this.setupMiddleware();
    this.setupConnectionHandler();
  }

  /**
   * JWT Authentication middleware for Socket.IO
   */
  setupMiddleware() {
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;
        next();
      } catch (error) {
        logger.warn('Socket authentication failed', { error: error.message });
        next(new Error('Invalid token: ' + error.message));
      }
    });
  }

  /**
   * Handle socket connections with room-based architecture
   */
  setupConnectionHandler() {
    this.io.on('connection', (socket) => {
      logger.info(`User connected: ${socket.userId}`, { 
        socketId: socket.id,
        role: socket.userRole 
      });

      // Track user connections
      if (!this.userSockets.has(socket.userId)) {
        this.userSockets.set(socket.userId, new Set());
      }
      this.userSockets.get(socket.userId).add(socket.id);
      this.socketUsers.set(socket.id, socket.userId);

      // Join user-specific room (for direct messages)
      socket.join(`user:${socket.userId}`);
      
      // Join role-based room (for broadcasts)
      socket.join(`role:${socket.userRole}`);

      // Send confirmation
      socket.emit('connected', {
        userId: socket.userId,
        socketId: socket.id,
        role: socket.userRole,
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error('Socket error', { 
          userId: socket.userId, 
          error: error.message 
        });
      });
    });
  }

  /**
   * Clean disconnect handling
   */
  handleDisconnect(socket) {
    const userId = this.socketUsers.get(socket.id);
    
    if (userId) {
      logger.info(`User disconnected: ${userId}`, { socketId: socket.id });
      
      // Remove from tracking
      if (this.userSockets.has(userId)) {
        this.userSockets.get(userId).delete(socket.id);
        
        // Clean up if no more connections
        if (this.userSockets.get(userId).size === 0) {
          this.userSockets.delete(userId);
        }
      }
      this.socketUsers.delete(socket.id);
    }
  }

  /**
   * Send message to specific user (all their devices)
   */
  sendToUser(userId, event, data) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Send message to role-based audience
   */
  broadcastToRole(role, event, data) {
    this.io.to(`role:${role}`).emit(event, data);
  }

  /**
   * Broadcast to all connected users
   */
  broadcast(event, data) {
    this.io.emit(event, data);
  }

  /**
   * Send message to specific socket
   */
  sendToSocket(socketId, event, data) {
    this.io.to(socketId).emit(event, data);
  }

  /**
   * Get active users count
   */
  getActiveUsersCount() {
    return this.userSockets.size;
  }

  /**
   * Get user's socket IDs
   */
  getUserSockets(userId) {
    return Array.from(this.userSockets.get(userId) || []);
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId) {
    return this.userSockets.has(userId) && this.userSockets.get(userId).size > 0;
  }
}

module.exports = SocketManager;
