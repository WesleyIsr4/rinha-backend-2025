const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const { logger, logHelpers } = require("./utils/logger");
const { MonitoringService } = require("./services/monitoringService");
const { AlertService } = require("./services/alertService");

// Import routes
const paymentsRoutes = require("./routes/payments");
const healthRoutes = require("./routes/health");

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize monitoring and alert services
const monitoringService = new MonitoringService();
const alertService = new AlertService();

// Middleware for monitoring
app.use((req, res, next) => {
  const startTime = Date.now();

  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function (chunk, encoding) {
    const responseTime = Date.now() - startTime;

    // Record request metrics
    monitoringService.recordRequest(
      req.method,
      req.path,
      res.statusCode,
      responseTime,
      res.statusCode >= 400 ? new Error(`HTTP ${res.statusCode}`) : null
    );

    // Check for alerts
    const metrics = monitoringService.getMetrics();
    const alerts = alertService.checkAlerts(metrics);

    if (alerts.length > 0) {
      logger.warn("Alerts triggered", {
        alerts: alerts.map((a) => ({
          id: a.id,
          type: a.type,
          severity: a.severity,
        })),
      });
    }

    originalEnd.call(this, chunk, encoding);
  };

  next();
});

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : ["http://localhost:3000", "http://localhost:8080"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Compression middleware
app.use(
  compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

// Body parsing middleware
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();

  logHelpers.logPayment("info", "Incoming request", {
    method: req.method,
    url: req.url,
    userAgent: req.get("User-Agent"),
    ip: req.ip,
    correlationId: req.headers["x-correlation-id"] || "unknown",
  });

  res.on("finish", () => {
    const duration = Date.now() - startTime;

    logHelpers.logPayment("info", "Request completed", {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get("Content-Length"),
    });
  });

  next();
});

// Routes
app.use("/payments", paymentsRoutes);
app.use("/health", healthRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "rinha-backend-2025",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Enhanced monitoring endpoint
app.get("/monitoring", (req, res) => {
  try {
    const metrics = monitoringService.getMetrics();
    const alerts = alertService.getActiveAlerts();
    const alertStats = alertService.getAlertStats();

    res.json({
      metrics,
      alerts: alerts.slice(0, 10), // Return only last 10 alerts
      alertStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logHelpers.logError("Failed to get monitoring data", error);
    res.status(500).json({
      error: "Failed to get monitoring data",
      message: error.message,
    });
  }
});

// Alert management endpoints
app.get("/alerts", (req, res) => {
  try {
    const { severity, type, limit = 50 } = req.query;
    let alerts = alertService.getActiveAlerts();

    if (severity) {
      alerts = alerts.filter((alert) => alert.severity === severity);
    }

    if (type) {
      alerts = alerts.filter((alert) => alert.type === type);
    }

    alerts = alerts.slice(0, parseInt(limit));

    res.json({
      alerts,
      total: alerts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logHelpers.logError("Failed to get alerts", error);
    res.status(500).json({
      error: "Failed to get alerts",
      message: error.message,
    });
  }
});

app.post("/alerts/:alertId/acknowledge", (req, res) => {
  try {
    const { alertId } = req.params;
    alertService.acknowledgeAlert(alertId);

    res.json({
      message: "Alert acknowledged",
      alertId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logHelpers.logError("Failed to acknowledge alert", error);
    res.status(500).json({
      error: "Failed to acknowledge alert",
      message: error.message,
    });
  }
});

app.post("/alerts/:alertId/resolve", (req, res) => {
  try {
    const { alertId } = req.params;
    alertService.resolveAlert(alertId);

    res.json({
      message: "Alert resolved",
      alertId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logHelpers.logError("Failed to resolve alert", error);
    res.status(500).json({
      error: "Failed to resolve alert",
      message: error.message,
    });
  }
});

// 404 handler
app.use((req, res) => {
  logHelpers.logPayment("warn", "404 Not Found", {
    method: req.method,
    url: req.url,
    userAgent: req.get("User-Agent"),
    ip: req.ip,
  });

  res.status(404).json({
    error: "Not Found",
    message: "The requested resource was not found",
    path: req.path,
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logHelpers.logError("Unhandled error", error, {
    method: req.method,
    url: req.url,
    userAgent: req.get("User-Agent"),
    ip: req.ip,
    correlationId: req.headers["x-correlation-id"] || "unknown",
  });

  // Record error in monitoring
  monitoringService.recordError(error, req.path);

  // Check for alerts after error
  const metrics = monitoringService.getMetrics();
  alertService.checkAlerts(metrics);

  res.status(500).json({
    error: "Internal Server Error",
    message:
      process.env.NODE_ENV === "production"
        ? "An internal server error occurred"
        : error.message,
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");

  // Close monitoring intervals
  if (monitoringService) {
    // Clear any intervals if they exist
    logger.info("Cleaning up monitoring service");
  }

  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});

// Unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logHelpers.logError("Unhandled Promise Rejection", reason, {
    promise: promise.toString(),
  });
});

// Uncaught exceptions
process.on("uncaughtException", (error) => {
  logHelpers.logError("Uncaught Exception", error);
  process.exit(1);
});

// Start server only if not in test environment
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    logger.info("Server started", {
      port: PORT,
      environment: process.env.NODE_ENV || "development",
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
    });

    // Log initial system metrics
    monitoringService.updateSystemMetrics();

    logger.info("Application ready", {
      monitoring: "enabled",
      alerts: "enabled",
      logging: "structured",
    });
  });
}

module.exports = app;
