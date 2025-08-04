const express = require("express");
const { PaymentService } = require("../services/paymentService");
const { DatabaseService } = require("../services/databaseService");
const { logger } = require("../utils/logger");

const router = express.Router();
const paymentService = new PaymentService();
const databaseService = new DatabaseService();

// Basic health check
router.get("/", async (req, res) => {
  try {
    const dbConnected = await databaseService.testConnection();
    const redisConnected = await databaseService.testRedisConnection();

    const healthStatus = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: {
        database: dbConnected ? "connected" : "disconnected",
        redis: redisConnected ? "connected" : "disconnected",
        paymentService: "running",
      },
    };

    const httpStatus = dbConnected && redisConnected ? 200 : 503;
    res.status(httpStatus).json(healthStatus);
  } catch (error) {
    logger.error("Health check failed", { error: error.message });
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Payment processors health check
router.get("/payment-processors", async (req, res) => {
  try {
    const healthData = await paymentService.getPaymentProcessorsHealth();
    res.json(healthData);
  } catch (error) {
    logger.error("Payment processors health check failed", {
      error: error.message,
    });
    res.status(500).json({
      error: "Failed to check payment processors health",
      details: error.message,
    });
  }
});

// Performance monitoring endpoint
router.get("/performance", async (req, res) => {
  try {
    const performanceMetrics = paymentService.getPerformanceMetrics();
    const dbStats = databaseService.getPoolStats();
    const paymentStats = await databaseService.getPaymentStats();

    const performanceData = {
      ...performanceMetrics,
      database: {
        pool: dbStats,
        payments: paymentStats,
      },
      timestamp: new Date().toISOString(),
    };

    res.json(performanceData);
  } catch (error) {
    logger.error("Performance monitoring failed", { error: error.message });
    res.status(500).json({
      error: "Failed to get performance metrics",
      details: error.message,
    });
  }
});

// Detailed statistics endpoint
router.get("/stats", async (req, res) => {
  try {
    const stats = paymentService.getServiceStats();
    const dbStats = databaseService.getPoolStats();
    const paymentStats = await databaseService.getPaymentStats();

    const detailedStats = {
      ...stats,
      database: {
        pool: dbStats,
        payments: paymentStats,
      },
      timestamp: new Date().toISOString(),
    };

    res.json(detailedStats);
  } catch (error) {
    logger.error("Failed to get detailed stats", { error: error.message });
    res.status(500).json({
      error: "Failed to get detailed statistics",
      details: error.message,
    });
  }
});

// Reset circuit breakers (for testing)
router.post("/reset-circuit-breakers", (req, res) => {
  try {
    paymentService.resetCircuitBreakers();
    res.json({ message: "Circuit breakers reset successfully" });
  } catch (error) {
    logger.error("Failed to reset circuit breakers", { error: error.message });
    res.status(500).json({
      error: "Failed to reset circuit breakers",
      details: error.message,
    });
  }
});

// Clear health check cache (for testing)
router.post("/clear-health-cache", async (req, res) => {
  try {
    await paymentService.clearHealthCheckCache();
    res.json({ message: "Health check cache cleared successfully" });
  } catch (error) {
    logger.error("Failed to clear health check cache", {
      error: error.message,
    });
    res.status(500).json({
      error: "Failed to clear health check cache",
      details: error.message,
    });
  }
});

// Clear audit logs (for testing)
router.post("/clear-audit-logs", (req, res) => {
  try {
    paymentService.clearAuditLogs();
    res.json({ message: "Audit logs cleared successfully" });
  } catch (error) {
    logger.error("Failed to clear audit logs", { error: error.message });
    res.status(500).json({
      error: "Failed to clear audit logs",
      details: error.message,
    });
  }
});

// Get audit logs by correlation ID
router.get("/audit/:correlationId", (req, res) => {
  try {
    const { correlationId } = req.params;
    const auditLogs = paymentService.getAuditLogsByCorrelationId(correlationId);
    res.json(auditLogs);
  } catch (error) {
    logger.error("Failed to get audit logs by correlation ID", {
      correlationId: req.params.correlationId,
      error: error.message,
    });
    res.status(500).json({
      error: "Failed to get audit logs",
      details: error.message,
    });
  }
});

// Get all audit logs
router.get("/audit", (req, res) => {
  try {
    const auditLogs = paymentService.getAllAuditLogs();
    res.json(auditLogs);
  } catch (error) {
    logger.error("Failed to get all audit logs", { error: error.message });
    res.status(500).json({
      error: "Failed to get audit logs",
      details: error.message,
    });
  }
});

module.exports = router;
