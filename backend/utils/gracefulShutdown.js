const { logger } = require('./logger');

/**
 * Graceful Shutdown Handler
 * Ensures all connections are closed properly before exit
 */
class GracefulShutdown {
  constructor(server, mongoose) {
    this.server = server;
    this.mongoose = mongoose;
    this.isShuttingDown = false;
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  setup() {
    const signals = ['SIGTERM', 'SIGINT'];

    signals.forEach((signal) => {
      process.on(signal, () => {
        logger.warn(`Received ${signal}, starting graceful shutdown...`);
        this.shutdown();
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
      this.shutdown();
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { 
        reason: reason.message || reason, 
        promise: promise.toString() 
      });
      this.shutdown();
    });
  }

  /**
   * Execute graceful shutdown
   */
  async shutdown() {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    const shutdownTimeout = setTimeout(() => {
      logger.error('Graceful shutdown timeout - force exiting');
      process.exit(1);
    }, 10000); // 10 second timeout

    try {
      logger.info('Closing HTTP server...');
      await new Promise((resolve, reject) => {
        this.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      logger.info('HTTP server closed');

      // Close all Socket.IO connections
      if (this.server.io) {
        logger.info('Disconnecting Socket.IO clients...');
        this.server.io.disconnectSockets();
      }

      logger.info('Closing MongoDB connection...');
      await this.mongoose.disconnect();
      logger.info('MongoDB connection closed');

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      clearTimeout(shutdownTimeout);
      logger.error('Error during graceful shutdown', { error: error.message });
      process.exit(1);
    }
  }
}

module.exports = GracefulShutdown;
