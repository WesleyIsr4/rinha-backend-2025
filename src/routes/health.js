const express = require("express");
const { PaymentService } = require("../services/paymentService");
const { logger } = require("../utils/logger");

const router = express.Router();
const paymentService = new PaymentService();

// GET /health - Application health check
router.get("/", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "rinha-backend-2025",
    version: "1.0.0",
  });
});

// GET /health/payment-processors - Check payment processors health
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

module.exports = router;
