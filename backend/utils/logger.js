const { nodeEnv } = require('../config/config');

class Logger {
  static formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaString = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
    return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaString}`.trim();
  }

  static info(message, meta = {}) {
    console.log(this.formatMessage('info', message, meta));
  }

  static error(message, meta = {}) {
    console.error(this.formatMessage('error', message, meta));
  }

  static warn(message, meta = {}) {
    console.warn(this.formatMessage('warn', message, meta));
  }

  static debug(message, meta = {}) {
    if (nodeEnv === 'development') {
      console.log(this.formatMessage('debug', message, meta));
    }
  }

  static success(message, meta = {}) {
    console.log(this.formatMessage('success', message, meta));
  }

  // Request logging middleware
  static requestLogger(req, res, next) {
    const start = Date.now();
    const { method, url, ip } = req;
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;
      
      const logData = {
        method,
        url,
        statusCode,
        duration: `${duration}ms`,
        ip,
        userAgent: req.get('User-Agent')
      };

      if (statusCode >= 400) {
        Logger.error(`${method} ${url} - ${statusCode}`, logData);
      } else {
        Logger.info(`${method} ${url} - ${statusCode}`, logData);
      }
    });

    next();
  }

  // Socket event logging
  static socketEvent(event, data = {}) {
    Logger.debug(`Socket Event: ${event}`, data);
  }

  // AI service logging
  static aiRequest(query, response, duration) {
    Logger.info('AI Request Processed', {
      queryLength: query.length,
      responseLength: response.length,
      duration: `${duration}ms`
    });
  }

  // Database operation logging
  static dbOperation(operation, collection, duration, error = null) {
    if (error) {
      Logger.error(`DB ${operation} failed on ${collection}`, {
        error: error.message,
        duration: `${duration}ms`
      });
    } else {
      Logger.debug(`DB ${operation} on ${collection}`, {
        duration: `${duration}ms`
      });
    }
  }

  // Chat message logging
  static chatMessage(roomId, senderId, messageType) {
    Logger.debug('Chat Message', {
      roomId,
      senderId,
      messageType,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = Logger;
