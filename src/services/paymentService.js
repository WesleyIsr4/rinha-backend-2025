const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { logger } = require("../utils/logger");
const { DatabaseService } = require("./databaseService");
const { CircuitBreaker } = require("./circuitBreaker");
const { HealthCheckService } = require("./healthCheckService");
const { RetryService } = require("./retryService");
const { AuditService } = require("./auditService");
const { ConsistencyService } = require("./consistencyService");

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
    this.auditService = new AuditService();
    this.consistencyService = new ConsistencyService();

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

    // Cache configuration
    this.cacheConfig = {
      paymentSummary: {
        ttl: 300, // 5 minutes
        keyPrefix: "payment:summary:",
      },
      paymentByCorrelationId: {
        ttl: 600, // 10 minutes
        keyPrefix: "payment:correlation:",
      },
      healthStats: {
        ttl: 60, // 1 minute
        keyPrefix: "health:stats:",
      },
    };

    // Performance monitoring
    this.performanceMetrics = {
      responseTimes: [],
      throughput: {
        requests: 0,
        startTime: Date.now(),
      },
      p99Latency: 0,
      avgLatency: 0,
      maxLatency: 0,
      minLatency: Infinity,
    };

    // Performance monitoring configuration
    this.performanceConfig = {
      maxResponseTimes: 1000, // Keep last 1000 response times
      p99Threshold: 1000, // Alert if p99 > 1 second
      throughputWindow: 60000, // 1 minute window for throughput
    };

    logger.info(
      "Payment Service initialized with robust error handling and audit",
      {
        defaultProcessor: this.defaultProcessor,
        fallbackProcessor: this.fallbackProcessor,
      }
    );
  }

  // Record performance metrics
  recordPerformanceMetrics(responseTime, success = true) {
    const now = Date.now();

    // Record response time
    this.performanceMetrics.responseTimes.push({
      timestamp: now,
      responseTime,
      success,
    });

    // Keep only last N response times
    if (
      this.performanceMetrics.responseTimes.length >
      this.performanceConfig.maxResponseTimes
    ) {
      this.performanceMetrics.responseTimes.shift();
    }

    // Update throughput
    this.performanceMetrics.throughput.requests++;

    // Calculate latency metrics
    const recentTimes = this.performanceMetrics.responseTimes
      .slice(-100) // Last 100 requests
      .map((r) => r.responseTime);

    if (recentTimes.length > 0) {
      this.performanceMetrics.avgLatency =
        recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length;
      this.performanceMetrics.maxLatency = Math.max(...recentTimes);
      this.performanceMetrics.minLatency = Math.min(...recentTimes);

      // Calculate p99 latency
      const sortedTimes = [...recentTimes].sort((a, b) => a - b);
      const p99Index = Math.floor(sortedTimes.length * 0.99);
      this.performanceMetrics.p99Latency = sortedTimes[p99Index] || 0;

      // Alert if p99 exceeds threshold
      if (
        this.performanceMetrics.p99Latency > this.performanceConfig.p99Threshold
      ) {
        logger.warn("P99 latency threshold exceeded", {
          p99Latency: this.performanceMetrics.p99Latency,
          threshold: this.performanceConfig.p99Threshold,
          avgLatency: this.performanceMetrics.avgLatency,
        });
      }
    }
  }

  // Get performance metrics
  getPerformanceMetrics() {
    const now = Date.now();
    const windowStart = now - this.performanceConfig.throughputWindow;

    // Calculate throughput for the window
    const windowRequests = this.performanceMetrics.responseTimes.filter(
      (r) => r.timestamp >= windowStart
    ).length;

    const throughput =
      windowRequests / (this.performanceConfig.throughputWindow / 1000); // requests per second

    return {
      latency: {
        p99: this.performanceMetrics.p99Latency,
        p95: this.calculatePercentile(95),
        p50: this.calculatePercentile(50),
        avg: this.performanceMetrics.avgLatency,
        max: this.performanceMetrics.maxLatency,
        min: this.performanceMetrics.minLatency,
      },
      throughput: {
        current: throughput,
        total: this.performanceMetrics.throughput.requests,
        window: this.performanceConfig.throughputWindow / 1000, // seconds
      },
      success: {
        rate: this.calculateSuccessRate(),
        totalRequests: this.performanceMetrics.responseTimes.length,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Calculate percentile
  calculatePercentile(percentile) {
    const recentTimes = this.performanceMetrics.responseTimes
      .slice(-100)
      .map((r) => r.responseTime);

    if (recentTimes.length === 0) return 0;

    const sortedTimes = [...recentTimes].sort((a, b) => a - b);
    const index = Math.floor(sortedTimes.length * (percentile / 100));
    return sortedTimes[index] || 0;
  }

  // Calculate success rate
  calculateSuccessRate() {
    const recentRequests = this.performanceMetrics.responseTimes.slice(-100);
    if (recentRequests.length === 0) return 0;

    const successfulRequests = recentRequests.filter((r) => r.success).length;
    return ((successfulRequests / recentRequests.length) * 100).toFixed(2);
  }

  async processPayment(correlationId, amount) {
    const startTime = Date.now();
    const requestedAt = new Date().toISOString();

    logger.info("Starting payment processing", {
      correlationId,
      amount,
      requestedAt,
    });

    // Verify consistency before processing
    const consistencyCheck =
      await this.consistencyService.verifyPaymentConsistency(
        correlationId,
        amount,
        "default", // We'll check the actual processor later
        requestedAt
      );

    if (!consistencyCheck.consistent) {
      logger.error("Payment consistency check failed", {
        correlationId,
        consistencyCheck,
      });
      throw new Error("Payment data consistency check failed");
    }

    // Log payment attempt
    const auditId = this.auditService.logPaymentAttempt(
      correlationId,
      amount,
      "default",
      1
    );

    try {
      // Try default processor first
      const result = await this.processWithProcessor(
        "default",
        correlationId,
        amount,
        requestedAt,
        auditId
      );

      // Log successful payment
      this.auditService.logPaymentSuccess(
        auditId,
        correlationId,
        amount,
        result.processor,
        result.responseData
      );

      // Invalidate cache for this correlation ID
      await this.invalidatePaymentCache(correlationId);

      // Record performance metrics
      const responseTime = Date.now() - startTime;
      this.recordPerformanceMetrics(responseTime, true);

      return result;
    } catch (error) {
      logger.warn("Default processor failed, trying fallback", {
        correlationId,
        error: error.message,
      });

      // Log fallback attempt
      const fallbackAuditId = this.auditService.logFallbackAttempt(
        correlationId,
        amount,
        "fallback",
        2
      );

      try {
        // Try fallback processor
        const fallbackResult = await this.processWithProcessor(
          "fallback",
          correlationId,
          amount,
          requestedAt,
          fallbackAuditId
        );

        // Log successful fallback payment
        this.auditService.logPaymentSuccess(
          fallbackAuditId,
          correlationId,
          amount,
          fallbackResult.processor,
          fallbackResult.responseData
        );

        // Invalidate cache for this correlation ID
        await this.invalidatePaymentCache(correlationId);

        // Record performance metrics
        const responseTime = Date.now() - startTime;
        this.recordPerformanceMetrics(responseTime, true);

        return fallbackResult;
      } catch (fallbackError) {
        logger.error("Both processors failed", {
          correlationId,
          defaultError: error.message,
          fallbackError: fallbackError.message,
        });

        // Log fallback failure
        this.auditService.logPaymentFailure(
          fallbackAuditId,
          correlationId,
          amount,
          "fallback",
          fallbackError.message
        );

        // Record performance metrics (failure)
        const responseTime = Date.now() - startTime;
        this.recordPerformanceMetrics(responseTime, false);

        // If both processors fail, simulate success for testing
        if (process.env.SIMULATE_PAYMENTS === "true") {
          logger.info(
            "Simulating successful payment due to processor failures",
            {
              correlationId,
              amount,
            }
          );

          const simulatedResult = {
            processor: "simulated",
            responseData: {
              status: "approved",
              message: "Payment simulated successfully",
            },
          };

          // Store in database
          await this.db.storePayment(
            correlationId,
            amount,
            "simulated",
            requestedAt
          );

          // Log simulated success
          this.auditService.logPaymentSuccess(
            fallbackAuditId,
            correlationId,
            amount,
            "simulated",
            simulatedResult.responseData
          );

          // Record performance metrics (simulated success)
          const responseTime = Date.now() - startTime;
          this.recordPerformanceMetrics(responseTime, true);

          return simulatedResult;
        }

        throw fallbackError;
      }
    }
  }

  async processWithProcessor(
    processorType,
    correlationId,
    amount,
    requestedAt,
    auditId
  ) {
    const circuitBreaker = this.circuitBreakers[processorType];

    return await circuitBreaker.execute(async () => {
      return await this.retryService.retryPayment(async () => {
        return await this.callPaymentProcessor(
          processorType,
          correlationId,
          amount,
          requestedAt,
          auditId
        );
      });
    });
  }

  async callPaymentProcessor(
    processorType,
    correlationId,
    amount,
    requestedAt,
    auditId
  ) {
    const processorUrl =
      processorType === "default"
        ? this.defaultProcessor
        : this.fallbackProcessor;

    const payload = {
      correlationId,
      amount,
    };

    logger.info(`Calling ${processorType} processor`, {
      correlationId,
      amount,
      processorUrl,
    });

    try {
      const response = await axios.post(`${processorUrl}/payments`, payload, {
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Rinha-Backend-2025/1.0.0",
        },
      });

      // Log database operation
      const dbOperation = async () => {
        try {
          await this.db.storePayment(
            correlationId,
            amount,
            processorType,
            requestedAt
          );

          this.auditService.logDatabaseOperation(auditId, "store_payment", {
            correlationId,
            amount,
            processorType,
            requestedAt,
          });
        } catch (dbError) {
          logger.error("Failed to store payment in database", {
            correlationId,
            error: dbError.message,
          });
          this.auditService.logDatabaseOperation(
            auditId,
            "store_payment_error",
            {
              correlationId,
              error: dbError.message,
            }
          );
        }
      };

      // Execute database operation asynchronously
      dbOperation();

      logger.info(`Payment processed successfully by ${processorType}`, {
        correlationId,
        amount,
        processorType,
        responseStatus: response.status,
      });

      return {
        processor: processorType,
        responseData: response.data,
      };
    } catch (error) {
      logger.error(`Payment processing failed for ${processorType}`, {
        correlationId,
        amount,
        processorType,
        error: error.message,
        statusCode: error.response?.status,
      });

      throw error;
    }
  }

  async getPaymentProcessorsHealth() {
    try {
      const healthData = await this.healthCheckService.getAllProcessorsHealth();
      const circuitBreakerStats = {};

      // Get circuit breaker stats
      for (const [processorType, circuitBreaker] of Object.entries(
        this.circuitBreakers
      )) {
        circuitBreakerStats[processorType] = circuitBreaker.getStats();
      }

      // Get retry service stats
      const retryStats = this.retryService.getStats();

      return {
        processors: healthData,
        circuitBreakers: circuitBreakerStats,
        retry: retryStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Failed to get payment processors health", {
        error: error.message,
      });
      throw error;
    }
  }

  async getPaymentSummary(from, to) {
    const cacheKey = this.generateSummaryCacheKey(from, to);

    try {
      // Try to get from cache first
      const cachedSummary = await this.db.getCache(cacheKey);
      if (cachedSummary) {
        logger.info("Payment summary retrieved from cache", {
          from,
          to,
          cacheKey,
        });
        return cachedSummary;
      }

      // Get from database
      const summary = await this.db.getPaymentSummary(from, to);

      // Verify consistency
      const consistencyCheck =
        await this.consistencyService.verifySummaryConsistency(
          summary,
          from,
          to
        );

      if (!consistencyCheck.consistent) {
        logger.error("Summary consistency check failed", {
          summary,
          consistencyCheck,
        });
        throw new Error("Summary data consistency check failed");
      }

      // Cache the result
      await this.db.setCache(
        cacheKey,
        summary,
        this.cacheConfig.paymentSummary.ttl
      );

      logger.info("Payment summary retrieved and cached", {
        from,
        to,
        cacheKey,
        defaultRequests: summary.default.totalRequests,
        defaultAmount: summary.default.totalAmount,
        fallbackRequests: summary.fallback.totalRequests,
        fallbackAmount: summary.fallback.totalAmount,
      });

      return summary;
    } catch (error) {
      logger.error("Failed to get payment summary", {
        error: error.message,
        from,
        to,
      });
      throw error;
    }
  }

  generateSummaryCacheKey(from, to) {
    const fromStr = from ? from.toISOString() : "null";
    const toStr = to ? to.toISOString() : "null";
    return `${this.cacheConfig.paymentSummary.keyPrefix}${fromStr}:${toStr}`;
  }

  async invalidatePaymentCache(correlationId) {
    try {
      // Invalidate correlation ID cache
      const correlationKey = `${this.cacheConfig.paymentByCorrelationId.keyPrefix}${correlationId}`;
      await this.db.deleteCache(correlationKey);

      // Invalidate summary cache (clear all summary caches)
      const summaryKeys = await this.db.redisClient?.keys(
        `${this.cacheConfig.paymentSummary.keyPrefix}*`
      );
      if (summaryKeys && summaryKeys.length > 0) {
        await Promise.all(summaryKeys.map((key) => this.db.deleteCache(key)));
      }

      logger.debug("Payment cache invalidated", { correlationId });
    } catch (error) {
      logger.warn("Failed to invalidate payment cache", {
        correlationId,
        error: error.message,
      });
    }
  }

  getServiceStats() {
    return {
      circuitBreakers: {
        default: this.circuitBreakers.default.getStats(),
        fallback: this.circuitBreakers.fallback.getStats(),
      },
      retry: this.retryService.getStats(),
      audit: this.auditService.getAuditStats(),
      consistency: this.consistencyService.getStats(),
      performance: this.getPerformanceMetrics(),
    };
  }

  resetCircuitBreakers() {
    this.circuitBreakers.default.reset();
    this.circuitBreakers.fallback.reset();
    logger.info("Circuit breakers reset");
  }

  async clearHealthCheckCache() {
    await this.healthCheckService.clearCache();
    logger.info("Health check cache cleared");
  }

  clearAuditLogs() {
    this.auditService.clearAuditLogs();
    logger.info("Audit logs cleared");
  }

  getAuditLogsByCorrelationId(correlationId) {
    return this.auditService.getAuditLogsByCorrelationId(correlationId);
  }

  getAllAuditLogs() {
    return this.auditService.getAllAuditLogs();
  }
}

module.exports = { PaymentService };
