const winston = require("winston");
require("winston-daily-rotate-file");

// Production log format with structured data
const productionFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DDTHH:mm:ss.SSSZ",
  }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ["message", "level", "timestamp", "service"],
  }),
  winston.format.json()
);

// Development log format (more readable)
const developmentFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.colorize(),
  winston.format.printf(
    ({ timestamp, level, message, service, ...metadata }) => {
      let msg = `${timestamp} [${service}] ${level}: ${message}`;
      if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
      }
      return msg;
    }
  )
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  defaultMeta: {
    service: "rinha-backend-2025",
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
  },
  transports: [],
});

// Add transports based on environment
if (process.env.NODE_ENV === "production") {
  // Production: Structured JSON logs with rotation
  logger.add(
    new winston.transports.DailyRotateFile({
      filename: "logs/application-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "14d", // Keep logs for 14 days
      format: productionFormat,
      level: "info",
    })
  );

  logger.add(
    new winston.transports.DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "30d", // Keep error logs for 30 days
      format: productionFormat,
      level: "error",
    })
  );

  // Performance logs (separate file for performance metrics)
  logger.add(
    new winston.transports.DailyRotateFile({
      filename: "logs/performance-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "7d", // Keep performance logs for 7 days
      format: productionFormat,
      level: "info",
    })
  );

  // Audit logs (separate file for audit trail)
  logger.add(
    new winston.transports.DailyRotateFile({
      filename: "logs/audit-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "90d", // Keep audit logs for 90 days
      format: productionFormat,
      level: "info",
    })
  );

  // Console transport for production (minimal)
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      level: "error", // Only errors to console in production
    })
  );
} else {
  // Development: More verbose console output
  logger.add(
    new winston.transports.Console({
      format: developmentFormat,
    })
  );

  // File transport for development
  logger.add(
    new winston.transports.File({
      filename: "logs/combined.log",
      format: productionFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: "logs/error.log",
      format: productionFormat,
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Performance logger (separate instance for performance metrics)
const performanceLogger = winston.createLogger({
  level: "info",
  defaultMeta: {
    service: "rinha-backend-2025",
    type: "performance",
    version: "1.0.0",
  },
  format: productionFormat,
  transports: [
    new winston.transports.DailyRotateFile({
      filename: "logs/performance-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "7d",
    }),
  ],
});

// Audit logger (separate instance for audit trail)
const auditLogger = winston.createLogger({
  level: "info",
  defaultMeta: {
    service: "rinha-backend-2025",
    type: "audit",
    version: "1.0.0",
  },
  format: productionFormat,
  transports: [
    new winston.transports.DailyRotateFile({
      filename: "logs/audit-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "20m",
      maxFiles: "90d",
    }),
  ],
});

// Helper functions for structured logging
const logHelpers = {
  // Log payment processing
  logPayment: (level, message, data) => {
    logger.log(level, message, {
      ...data,
      category: "payment",
      timestamp: new Date().toISOString(),
    });
  },

  // Log performance metrics
  logPerformance: (message, metrics) => {
    performanceLogger.info(message, {
      ...metrics,
      timestamp: new Date().toISOString(),
    });
  },

  // Log audit events
  logAudit: (message, auditData) => {
    auditLogger.info(message, {
      ...auditData,
      timestamp: new Date().toISOString(),
    });
  },

  // Log health check events
  logHealth: (level, message, healthData) => {
    logger.log(level, message, {
      ...healthData,
      category: "health",
      timestamp: new Date().toISOString(),
    });
  },

  // Log database operations
  logDatabase: (level, message, dbData) => {
    logger.log(level, message, {
      ...dbData,
      category: "database",
      timestamp: new Date().toISOString(),
    });
  },

  // Log cache operations
  logCache: (level, message, cacheData) => {
    logger.log(level, message, {
      ...cacheData,
      category: "cache",
      timestamp: new Date().toISOString(),
    });
  },

  // Log circuit breaker events
  logCircuitBreaker: (level, message, cbData) => {
    logger.log(level, message, {
      ...cbData,
      category: "circuit-breaker",
      timestamp: new Date().toISOString(),
    });
  },

  // Log error with context
  logError: (message, error, context = {}) => {
    logger.error(message, {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
      },
      ...context,
      category: "error",
      timestamp: new Date().toISOString(),
    });
  },
};

// Handle uncaught exceptions
logger.exceptions.handle(
  new winston.transports.DailyRotateFile({
    filename: "logs/exceptions-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "30d",
  })
);

// Handle unhandled promise rejections
logger.rejections.handle(
  new winston.transports.DailyRotateFile({
    filename: "logs/rejections-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "30d",
  })
);

module.exports = { logger, performanceLogger, auditLogger, logHelpers };
