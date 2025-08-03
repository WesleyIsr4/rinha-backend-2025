const express = require("express");
const { validatePaymentRequest } = require("../validators/paymentValidator");
const { PaymentService } = require("../services/paymentService");
const { logger } = require("../utils/logger");

const router = express.Router();
const paymentService = new PaymentService();

// POST /payments - Process payment
router.post("/", async (req, res, next) => {
  try {
    // Validate request
    const { error, value } = validatePaymentRequest(req.body);
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details,
      });
    }

    const { correlationId, amount } = value;

    logger.info("Processing payment request", {
      correlationId,
      amount,
    });

    // Process payment
    const result = await paymentService.processPayment(correlationId, amount);

    logger.info("Payment processed successfully", {
      correlationId,
      amount,
      processor: result.processor,
    });

    res.status(200).json({
      message: "Payment processed successfully",
      correlationId,
      amount,
      processor: result.processor,
    });
  } catch (error) {
    logger.error("Payment processing failed", {
      error: error.message,
      correlationId: req.body.correlationId,
    });
    next(error);
  }
});

// GET /payments-summary - Get payment summary
router.get("/summary", async (req, res, next) => {
  try {
    const { from, to } = req.query;

    logger.info("Fetching payment summary", { from, to });

    const summary = await paymentService.getPaymentSummary(from, to);

    logger.info("Payment summary retrieved", {
      defaultRequests: summary.default.totalRequests,
      defaultAmount: summary.default.totalAmount,
      fallbackRequests: summary.fallback.totalRequests,
      fallbackAmount: summary.fallback.totalAmount,
    });

    res.status(200).json(summary);
  } catch (error) {
    logger.error("Failed to get payment summary", {
      error: error.message,
    });
    next(error);
  }
});

module.exports = router;
