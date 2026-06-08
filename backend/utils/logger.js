const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Morgan setup for HTTP request logging
const requestLogger = morgan((tokens, req, res) => {
  const status = tokens.status(req, res);
  const method = tokens.method(req, res);
  const url = tokens.url(req, res);
  const responseTime = tokens['response-time'](req, res);
  
  const logLevel = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
  
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level: logLevel,
    method,
    url,
    status,
    responseTime: `${responseTime}ms`,
    userId: req.user?.userId || 'anonymous',
    ip: req.ip,
  });
});

// Setup Morgan with file and console output
const morganStream = fs.createWriteStream(
  path.join(logsDir, 'requests.log'),
  { flags: 'a' }
);

// Custom logger for application events
class AppLogger {
  log(level, message, meta = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    };
    
    const logString = JSON.stringify(logEntry);
    
    // Console output for development
    if (process.env.NODE_ENV !== 'production') {
      const colors = {
        ERROR: '\x1b[31m',
        WARN: '\x1b[33m',
        INFO: '\x1b[36m',
        DEBUG: '\x1b[35m',
        RESET: '\x1b[0m',
      };
      console.log(
        `${colors[level] || ''}[${logEntry.timestamp}] ${level}: ${message}${colors.RESET}`
      );
    }
    
    // File logging for all environments
    fs.appendFileSync(
      path.join(logsDir, `${level.toLowerCase()}.log`),
      logString + '\n'
    );
  }

  error(message, meta) {
    this.log('ERROR', message, meta);
  }

  warn(message, meta) {
    this.log('WARN', message, meta);
  }

  info(message, meta) {
    this.log('INFO', message, meta);
  }

  debug(message, meta) {
    this.log('DEBUG', message, meta);
  }
}

module.exports = {
  requestLogger: morgan.stream ? requestLogger : morgan('combined', { stream: morganStream }),
  morganStream,
  logger: new AppLogger(),
};
