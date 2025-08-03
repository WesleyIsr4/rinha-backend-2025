const express = require("express");
const { PaymentService } = require("../services/paymentService");
const { logger } = require("../utils/logger");

const router = express.Router();
const paymentService = new PaymentService();

router.get("/", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "rinha-backend-2025",
    version: "1.0.0",
  });
});

router.get("/payment-processors", async (req, res) => {
  try {
    const healthStatus = await paymentService.getPaymentProcessorsHealth();

    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      processors: healthStatus,
    });
  } catch (error) {
    logger.error("Health check failed", { error: error.message });
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// New route for detailed service statistics
router.get("/stats", async (req, res) => {
  try {
    const serviceStats = paymentService.getServiceStats();
    
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "rinha-backend-2025",
      version: "1.0.0",
      stats: serviceStats,
    });
  } catch (error) {
    logger.error("Failed to get service stats", { error: error.message });
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// Route to reset circuit breakers (for testing)
router.post("/reset-circuit-breakers", (req, res) => {
  try {
    paymentService.resetCircuitBreakers();
    
    res.status(200).json({
      message: "Circuit breakers reset successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to reset circuit breakers", { error: error.message });
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// Route to clear health check cache (for testing)
router.post("/clear-health-cache", (req, res) => {
  try {
    paymentService.clearHealthCheckCache();
    
    res.status(200).json({
      message: "Health check cache cleared successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Failed to clear health check cache", { error: error.message });
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

module.exports = router;
