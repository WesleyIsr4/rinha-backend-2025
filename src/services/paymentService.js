const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { logger } = require("../utils/logger");
const { DatabaseService } = require("./databaseService");
const { CircuitBreaker } = require("./circuitBreaker");
const { HealthCheckService } = require("./healthCheckService");
const { RetryService } = require("./retryService");

class PaymentService {
  constructor() {
    this.defaultProcessor = "http://payment-processor-default:8080";
    this.fallbackProcessor = "http://payment-processor-fallback:8080";
    
    // Initialize services
    this.db = new DatabaseService();
    this.healthCheckService = new HealthCheckService();
    this.retryService = new RetryService({
      maxRetries: 2,
      baseDelay: 500,
      maxDelay: 5000,
    });
    
    // Initialize circuit breakers
    this.circuitBreakers = {
      default: new CircuitBreaker("default-processor", {
        failureThreshold: 3,
        timeout: 30000, // 30 seconds
      }),
      fallback: new CircuitBreaker("fallback-processor", {
        failureThreshold: 3,
        timeout: 30000, // 30 seconds
      }),
    };
    
    logger.info("Payment Service initialized with robust error handling", {
      defaultProcessor: this.defaultProcessor,
      fallbackProcessor: this.fallbackProcessor,
    });
  }

  async processPayment(correlationId, amount) {
    const requestedAt = new Date().toISOString();

    logger.info("Starting payment processing", {
      correlationId,
      amount,
      requestedAt,
    });

    try {
      // Try default processor first
      const result = await this.processWithProcessor("default", correlationId, amount, requestedAt);
      return result;
    } catch (error) {
      logger.warn("Default processor failed, trying fallback", {
        correlationId,
        error: error.message,
      });

      try {
        // Try fallback processor
        const result = await this.processWithProcessor("fallback", correlationId, amount, requestedAt);
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

  async processWithProcessor(processorType, correlationId, amount, requestedAt) {
    const circuitBreaker = this.circuitBreakers[processorType];
    
    return await circuitBreaker.execute(async () => {
      return await this.retryService.retryPayment(
        processorType,
        correlationId,
        amount,
        requestedAt,
        async () => {
          return await this.callPaymentProcessor(processorType, correlationId, amount, requestedAt);
        }
      );
    });
  }

  async callPaymentProcessor(processorType, correlationId, amount, requestedAt) {
    const processorUrl = processorType === "default" 
      ? this.defaultProcessor 
      : this.fallbackProcessor;

    const payload = {
      correlationId,
      amount,
      requestedAt,
    };

    logger.info(`Calling ${processorType} processor`, {
      correlationId,
      processorUrl,
      payload,
    });

    try {
      const response = await axios.post(`${processorUrl}/payments`, payload, {
        timeout: 10000, // 10 seconds timeout
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Rinha-Backend-2025/1.0.0",
        },
      });

      logger.info(`Payment processed by ${processorType} processor`, {
        correlationId,
        processor: processorType,
        status: response.status,
        responseData: response.data,
      });

      // Store payment record
      await this.db.storePayment(
        correlationId,
        amount,
        processorType,
        requestedAt
      );

      return {
        success: true,
        processor: processorType,
        message: response.data.message || "Payment processed successfully",
        responseData: response.data,
      };
    } catch (error) {
      logger.error(`${processorType} processor failed`, {
        correlationId,
        error: error.message,
        status: error.response?.status,
        responseData: error.response?.data,
        processorUrl,
      });
      throw error;
    }
  }

  async getPaymentProcessorsHealth() {
    try {
      const healthStatus = await this.healthCheckService.getAllProcessorsHealth();
      
      // Add circuit breaker stats
      healthStatus.default.circuitBreaker = this.circuitBreakers.default.getStats();
      healthStatus.fallback.circuitBreaker = this.circuitBreakers.fallback.getStats();
      
      // Add retry service stats
      healthStatus.retryService = this.retryService.getStats();
      
      // Add health check stats
      healthStatus.healthCheckStats = this.healthCheckService.getHealthStats();

      return healthStatus;
    } catch (error) {
      logger.error("Failed to get payment processors health", {
        error: error.message,
      });
      
      return {
        default: {
          failing: true,
          minResponseTime: 999999,
          isHealthy: false,
          error: error.message,
          circuitBreaker: this.circuitBreakers.default.getStats(),
        },
        fallback: {
          failing: true,
          minResponseTime: 999999,
          isHealthy: false,
          error: error.message,
          circuitBreaker: this.circuitBreakers.fallback.getStats(),
        },
        retryService: this.retryService.getStats(),
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getPaymentSummary(from, to) {
    try {
      return await this.db.getPaymentSummary(from, to);
    } catch (error) {
      logger.error("Failed to get payment summary from database", {
        error: error.message,
        from,
        to,
      });

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

  // Get comprehensive service statistics
  getServiceStats() {
    return {
      circuitBreakers: {
        default: this.circuitBreakers.default.getStats(),
        fallback: this.circuitBreakers.fallback.getStats(),
      },
      retryService: this.retryService.getStats(),
      healthCheck: this.healthCheckService.getHealthStats(),
    };
  }

  // Reset circuit breakers (useful for testing)
  resetCircuitBreakers() {
    this.circuitBreakers.default.reset();
    this.circuitBreakers.fallback.reset();
    logger.info("Circuit breakers reset");
  }

  // Clear health check cache (useful for testing)
  clearHealthCheckCache() {
    this.healthCheckService.clearCache();
    logger.info("Health check cache cleared");
  }
}

module.exports = { PaymentService };
