const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { logger } = require("../utils/logger");
const { DatabaseService } = require("./databaseService");

class PaymentService {
  constructor() {
    this.defaultProcessor = "http://payment-processor-default:8080";
    this.fallbackProcessor = "http://payment-processor-fallback:8080";
    this.healthCheckCache = new Map();
    this.healthCheckInterval = 5000; // 5 seconds
    this.lastHealthCheck = {
      default: 0,
      fallback: 0,
    };
    this.db = new DatabaseService();
  }

  // Process payment with fallback strategy
  async processPayment(correlationId, amount) {
    const requestedAt = new Date().toISOString();

    logger.info("Starting payment processing", {
      correlationId,
      amount,
      requestedAt,
    });

    try {
      // Try default processor first
      const result = await this.tryProcessor(
        "default",
        correlationId,
        amount,
        requestedAt
      );
      return result;
    } catch (error) {
      logger.warn("Default processor failed, trying fallback", {
        correlationId,
        error: error.message,
      });

      try {
        // Try fallback processor
        const result = await this.tryProcessor(
          "fallback",
          correlationId,
          amount,
          requestedAt
        );
        return result;
      } catch (fallbackError) {
        logger.error("Both processors failed", {
          correlationId,
          defaultError: error.message,
          fallbackError: fallbackError.message,
        });

        // For development/testing, simulate successful payment when processors are unavailable
        if (
          process.env.NODE_ENV === "development" ||
          process.env.SIMULATE_PAYMENTS === "true"
        ) {
          logger.warn("Simulating payment processing for development", {
            correlationId,
            amount,
          });

          // Store payment record for summary
          await this.db.storePayment(
            correlationId,
            amount,
            "default", // Assume default processor
            requestedAt
          );

          return {
            success: true,
            processor: "default",
            message: "Payment processed successfully (simulated)",
          };
        }

        throw new Error("All payment processors are unavailable");
      }
    }
  }

  // Try to process payment with specific processor
  async tryProcessor(processorType, correlationId, amount, requestedAt) {
    const processorUrl =
      processorType === "default"
        ? this.defaultProcessor
        : this.fallbackProcessor;

    const payload = {
      correlationId,
      amount,
      requestedAt,
    };

    logger.info(`Trying ${processorType} processor`, {
      correlationId,
      processorUrl,
    });

    try {
      const response = await axios.post(`${processorUrl}/payments`, payload, {
        timeout: 10000, // 10 seconds timeout
        headers: {
          "Content-Type": "application/json",
        },
      });

      logger.info(`Payment processed by ${processorType} processor`, {
        correlationId,
        processor: processorType,
        status: response.status,
      });

      // Store payment record for summary
      await this.db.storePayment(
        correlationId,
        amount,
        processorType,
        requestedAt
      );

      return {
        success: true,
        processor: processorType,
        message: response.data.message,
      };
    } catch (error) {
      logger.error(`${processorType} processor failed`, {
        correlationId,
        error: error.message,
        status: error.response?.status,
      });
      throw error;
    }
  }

  // Get payment processors health status
  async getPaymentProcessorsHealth() {
    const now = Date.now();
    const healthStatus = {};

    // Check default processor
    if (now - this.lastHealthCheck.default >= this.healthCheckInterval) {
      try {
        const response = await axios.get(
          `${this.defaultProcessor}/payments/service-health`,
          {
            timeout: 5000,
          }
        );
        healthStatus.default = response.data;
        this.lastHealthCheck.default = now;
      } catch (error) {
        healthStatus.default = {
          failing: true,
          minResponseTime: 999999,
          error: error.message,
        };
      }
    } else {
      healthStatus.default = this.healthCheckCache.get("default") || {
        failing: true,
        minResponseTime: 999999,
      };
    }

    // Check fallback processor
    if (now - this.lastHealthCheck.fallback >= this.healthCheckInterval) {
      try {
        const response = await axios.get(
          `${this.fallbackProcessor}/payments/service-health`,
          {
            timeout: 5000,
          }
        );
        healthStatus.fallback = response.data;
        this.lastHealthCheck.fallback = now;
      } catch (error) {
        healthStatus.fallback = {
          failing: true,
          minResponseTime: 999999,
          error: error.message,
        };
      }
    } else {
      healthStatus.fallback = this.healthCheckCache.get("fallback") || {
        failing: true,
        minResponseTime: 999999,
      };
    }

    // Update cache
    this.healthCheckCache.set("default", healthStatus.default);
    this.healthCheckCache.set("fallback", healthStatus.fallback);

    return healthStatus;
  }

  // Get payment summary from database
  async getPaymentSummary(from, to) {
    try {
      return await this.db.getPaymentSummary(from, to);
    } catch (error) {
      logger.error("Failed to get payment summary from database", {
        error: error.message,
        from,
        to,
      });

      // Fallback to empty summary
      return {
        default: {
          totalRequests: 0,
          totalAmount: 0,
        },
        fallback: {
          totalRequests: 0,
          totalAmount: 0,
        },
      };
    }
  }
}

module.exports = { PaymentService };
