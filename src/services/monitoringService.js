const { logger, logHelpers } = require("../utils/logger");

class MonitoringService {
  constructor() {
    this.metrics = {
      // Request metrics
      requests: {
        total: 0,
        successful: 0,
        failed: 0,
        byEndpoint: {},
        byMethod: {},
      },

      // Performance metrics
      performance: {
        responseTimes: [],
        p99: 0,
        p95: 0,
        p50: 0,
        avg: 0,
        min: Infinity,
        max: 0,
      },

      // System metrics
      system: {
        memory: {
          used: 0,
          total: 0,
          percentage: 0,
        },
        cpu: {
          usage: 0,
          load: 0,
        },
        uptime: 0,
      },

      // Business metrics
      business: {
        payments: {
          total: 0,
          successful: 0,
          failed: 0,
          byProcessor: {
            default: 0,
            fallback: 0,
            simulated: 0,
          },
          totalAmount: 0,
        },
        circuitBreakers: {
          default: { state: "CLOSED", failures: 0, successes: 0 },
          fallback: { state: "CLOSED", failures: 0, successes: 0 },
        },
        cache: {
          hits: 0,
          misses: 0,
          hitRate: 0,
        },
      },

      // Error tracking
      errors: {
        total: 0,
        byType: {},
        byEndpoint: {},
        recent: [],
      },
    };

    this.startTime = Date.now();
    this.lastReset = Date.now();

    // Start monitoring intervals
    this.startMonitoring();

    logger.info("Monitoring Service initialized");
  }

  // Start monitoring intervals
  startMonitoring() {
    // Update system metrics every 30 seconds
    setInterval(() => {
      this.updateSystemMetrics();
    }, 30000);

    // Log metrics every minute
    setInterval(() => {
      this.logMetrics();
    }, 60000);

    // Reset counters daily
    setInterval(() => {
      this.resetDailyMetrics();
    }, 24 * 60 * 60 * 1000);
  }

  // Record request metrics
  recordRequest(method, endpoint, statusCode, responseTime, error = null) {
    const isSuccess = statusCode >= 200 && statusCode < 400;

    // Update request counters
    this.metrics.requests.total++;
    if (isSuccess) {
      this.metrics.requests.successful++;
    } else {
      this.metrics.requests.failed++;
    }

    // Update endpoint metrics
    if (!this.metrics.requests.byEndpoint[endpoint]) {
      this.metrics.requests.byEndpoint[endpoint] = {
        total: 0,
        successful: 0,
        failed: 0,
        avgResponseTime: 0,
      };
    }

    const endpointMetrics = this.metrics.requests.byEndpoint[endpoint];
    endpointMetrics.total++;
    if (isSuccess) {
      endpointMetrics.successful++;
    } else {
      endpointMetrics.failed++;
    }

    // Update average response time
    endpointMetrics.avgResponseTime =
      (endpointMetrics.avgResponseTime * (endpointMetrics.total - 1) +
        responseTime) /
      endpointMetrics.total;

    // Update method metrics
    if (!this.metrics.requests.byMethod[method]) {
      this.metrics.requests.byMethod[method] = {
        total: 0,
        successful: 0,
        failed: 0,
      };
    }

    const methodMetrics = this.metrics.requests.byMethod[method];
    methodMetrics.total++;
    if (isSuccess) {
      methodMetrics.successful++;
    } else {
      methodMetrics.failed++;
    }

    // Update performance metrics
    this.updatePerformanceMetrics(responseTime);

    // Record error if any
    if (error) {
      this.recordError(error, endpoint);
    }

    // Log high response times
    if (responseTime > 1000) {
      logHelpers.logPerformance("High response time detected", {
        endpoint,
        method,
        responseTime,
        statusCode,
      });
    }
  }

  // Update performance metrics
  updatePerformanceMetrics(responseTime) {
    this.metrics.performance.responseTimes.push(responseTime);

    // Keep only last 1000 response times
    if (this.metrics.performance.responseTimes.length > 1000) {
      this.metrics.performance.responseTimes.shift();
    }

    // Calculate percentiles
    const sortedTimes = [...this.metrics.performance.responseTimes].sort(
      (a, b) => a - b
    );
    const count = sortedTimes.length;

    if (count > 0) {
      this.metrics.performance.p50 = sortedTimes[Math.floor(count * 0.5)];
      this.metrics.performance.p95 = sortedTimes[Math.floor(count * 0.95)];
      this.metrics.performance.p99 = sortedTimes[Math.floor(count * 0.99)];
      this.metrics.performance.avg =
        sortedTimes.reduce((a, b) => a + b, 0) / count;
      this.metrics.performance.min = Math.min(...sortedTimes);
      this.metrics.performance.max = Math.max(...sortedTimes);
    }
  }

  // Record payment metrics
  recordPayment(processor, amount, success, responseTime) {
    this.metrics.business.payments.total++;
    this.metrics.business.payments.totalAmount += amount;

    if (success) {
      this.metrics.business.payments.successful++;
    } else {
      this.metrics.business.payments.failed++;
    }

    if (this.metrics.business.payments.byProcessor[processor] !== undefined) {
      this.metrics.business.payments.byProcessor[processor]++;
    }

    // Log payment performance
    logHelpers.logPerformance("Payment processed", {
      processor,
      amount,
      success,
      responseTime,
      totalPayments: this.metrics.business.payments.total,
      successRate: this.getPaymentSuccessRate(),
    });
  }

  // Record circuit breaker state change
  recordCircuitBreakerState(processor, state, failures, successes) {
    this.metrics.business.circuitBreakers[processor] = {
      state,
      failures,
      successes,
      timestamp: new Date().toISOString(),
    };

    logHelpers.logCircuitBreaker("Circuit breaker state changed", {
      processor,
      state,
      failures,
      successes,
    });
  }

  // Record cache metrics
  recordCacheOperation(operation, hit, key, responseTime) {
    if (hit) {
      this.metrics.business.cache.hits++;
    } else {
      this.metrics.business.cache.misses++;
    }

    this.metrics.business.cache.hitRate =
      (this.metrics.business.cache.hits /
        (this.metrics.business.cache.hits +
          this.metrics.business.cache.misses)) *
      100;

    logHelpers.logCache("Cache operation", {
      operation,
      hit,
      key,
      responseTime,
      hitRate: this.metrics.business.cache.hitRate,
    });
  }

  // Record error
  recordError(error, endpoint = null) {
    this.metrics.errors.total++;

    const errorType = error.name || "Unknown";
    this.metrics.errors.byType[errorType] =
      (this.metrics.errors.byType[errorType] || 0) + 1;

    if (endpoint) {
      this.metrics.errors.byEndpoint[endpoint] =
        (this.metrics.errors.byEndpoint[endpoint] || 0) + 1;
    }

    // Keep recent errors (last 100)
    this.metrics.errors.recent.push({
      message: error.message,
      type: errorType,
      endpoint,
      timestamp: new Date().toISOString(),
      stack: error.stack,
    });

    if (this.metrics.errors.recent.length > 100) {
      this.metrics.errors.recent.shift();
    }

    logHelpers.logError("Error recorded", error, {
      endpoint,
      errorType,
      totalErrors: this.metrics.errors.total,
    });
  }

  // Update system metrics
  updateSystemMetrics() {
    const memUsage = process.memoryUsage();
    const totalMem = require("os").totalmem();

    this.metrics.system.memory = {
      used: memUsage.heapUsed,
      total: totalMem,
      percentage: (memUsage.heapUsed / totalMem) * 100,
    };

    this.metrics.system.uptime = Date.now() - this.startTime;

    // Log high memory usage
    if (this.metrics.system.memory.percentage > 80) {
      logHelpers.logError(
        "High memory usage detected",
        new Error("Memory usage > 80%"),
        {
          memoryUsage: this.metrics.system.memory.percentage,
          heapUsed: this.metrics.system.memory.used,
        }
      );
    }
  }

  // Get payment success rate
  getPaymentSuccessRate() {
    const total = this.metrics.business.payments.total;
    return total > 0
      ? (this.metrics.business.payments.successful / total) * 100
      : 0;
  }

  // Get overall success rate
  getOverallSuccessRate() {
    const total = this.metrics.requests.total;
    return total > 0 ? (this.metrics.requests.successful / total) * 100 : 0;
  }

  // Log metrics
  logMetrics() {
    const metrics = {
      requests: {
        total: this.metrics.requests.total,
        successRate: this.getOverallSuccessRate(),
        byEndpoint: Object.keys(this.metrics.requests.byEndpoint).length,
        byMethod: Object.keys(this.metrics.requests.byMethod).length,
      },
      performance: {
        p99: this.metrics.performance.p99,
        p95: this.metrics.performance.p95,
        p50: this.metrics.performance.p50,
        avg: this.metrics.performance.avg,
      },
      business: {
        payments: {
          total: this.metrics.business.payments.total,
          successRate: this.getPaymentSuccessRate(),
          totalAmount: this.metrics.business.payments.totalAmount,
        },
        cache: {
          hitRate: this.metrics.business.cache.hitRate,
        },
      },
      system: {
        memory: this.metrics.system.memory.percentage,
        uptime: this.metrics.system.uptime,
      },
      errors: {
        total: this.metrics.errors.total,
        types: Object.keys(this.metrics.errors.byType).length,
      },
    };

    logHelpers.logPerformance("System metrics", metrics);
  }

  // Reset daily metrics
  resetDailyMetrics() {
    this.lastReset = Date.now();

    // Reset request metrics
    this.metrics.requests = {
      total: 0,
      successful: 0,
      failed: 0,
      byEndpoint: {},
      byMethod: {},
    };

    // Reset business metrics
    this.metrics.business.payments = {
      total: 0,
      successful: 0,
      failed: 0,
      byProcessor: {
        default: 0,
        fallback: 0,
        simulated: 0,
      },
      totalAmount: 0,
    };

    // Reset cache metrics
    this.metrics.business.cache = {
      hits: 0,
      misses: 0,
      hitRate: 0,
    };

    // Reset error metrics
    this.metrics.errors = {
      total: 0,
      byType: {},
      byEndpoint: {},
      recent: [],
    };

    logger.info("Daily metrics reset");
  }

  // Get all metrics
  getMetrics() {
    return {
      ...this.metrics,
      calculated: {
        successRate: this.getOverallSuccessRate(),
        paymentSuccessRate: this.getPaymentSuccessRate(),
        uptime: this.metrics.system.uptime,
        requestsPerSecond: this.calculateRequestsPerSecond(),
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Calculate requests per second
  calculateRequestsPerSecond() {
    const uptime = (Date.now() - this.startTime) / 1000; // seconds
    return uptime > 0 ? this.metrics.requests.total / uptime : 0;
  }

  // Get alerts
  getAlerts() {
    const alerts = [];

    // Performance alerts
    if (this.metrics.performance.p99 > 1000) {
      alerts.push({
        type: "performance",
        severity: "warning",
        message: "P99 latency exceeds 1 second",
        value: this.metrics.performance.p99,
        threshold: 1000,
      });
    }

    // Success rate alerts
    if (this.getOverallSuccessRate() < 99) {
      alerts.push({
        type: "reliability",
        severity: "critical",
        message: "Success rate below 99%",
        value: this.getOverallSuccessRate(),
        threshold: 99,
      });
    }

    // Memory alerts
    if (this.metrics.system.memory.percentage > 80) {
      alerts.push({
        type: "system",
        severity: "warning",
        message: "Memory usage above 80%",
        value: this.metrics.system.memory.percentage,
        threshold: 80,
      });
    }

    // Error rate alerts
    const errorRate =
      (this.metrics.errors.total / Math.max(this.metrics.requests.total, 1)) *
      100;
    if (errorRate > 5) {
      alerts.push({
        type: "reliability",
        severity: "critical",
        message: "Error rate above 5%",
        value: errorRate,
        threshold: 5,
      });
    }

    return alerts;
  }
}

module.exports = { MonitoringService };
