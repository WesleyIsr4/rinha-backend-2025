const axios = require("axios");
const { logger } = require("../utils/logger");

class HealthCheckService {
  constructor() {
    this.defaultProcessor = "http://payment-processor-default:8080";
    this.fallbackProcessor = "http://payment-processor-fallback:8080";
    
    // Cache for health check results
    this.healthCache = new Map();
    this.lastHealthCheck = {
      default: 0,
      fallback: 0,
    };
    
    // Rate limiting: 1 call per 5 seconds
    this.healthCheckInterval = 5000; // 5 seconds
    this.healthCheckTimeout = 3000; // 3 seconds timeout
    
    // Performance tracking
    this.responseTimes = {
      default: [],
      fallback: [],
    };
    
    logger.info("Health Check Service initialized", {
      defaultProcessor: this.defaultProcessor,
      fallbackProcessor: this.fallbackProcessor,
      healthCheckInterval: this.healthCheckInterval,
      healthCheckTimeout: this.healthCheckTimeout,
    });
  }

  async getProcessorHealth(processorType) {
    const now = Date.now();
    const lastCheck = this.lastHealthCheck[processorType];
    
    // Check if we can make a new health check (rate limiting)
    if (now - lastCheck < this.healthCheckInterval) {
      const cachedHealth = this.healthCache.get(processorType);
      if (cachedHealth) {
        logger.debug(`Using cached health check for ${processorType}`, {
          cachedAt: new Date(lastCheck).toISOString(),
          timeUntilNextCheck: this.healthCheckInterval - (now - lastCheck),
        });
        return cachedHealth;
      }
    }

    // Perform new health check
    return await this.performHealthCheck(processorType);
  }

  async performHealthCheck(processorType) {
    const processorUrl = processorType === "default" 
      ? this.defaultProcessor 
      : this.fallbackProcessor;
    
    const healthEndpoint = `${processorUrl}/payments/service-health`;
    const startTime = Date.now();
    
    logger.info(`Performing health check for ${processorType}`, {
      url: healthEndpoint,
      timestamp: new Date().toISOString(),
    });

    try {
      const response = await axios.get(healthEndpoint, {
        timeout: this.healthCheckTimeout,
        headers: {
          "User-Agent": "Rinha-Backend-2025/1.0.0",
        },
      });

      const responseTime = Date.now() - startTime;
      this.recordResponseTime(processorType, responseTime);
      
      const healthData = {
        ...response.data,
        responseTime,
        lastChecked: new Date().toISOString(),
        isHealthy: !response.data.failing,
      };

      // Update cache and last check time
      this.healthCache.set(processorType, healthData);
      this.lastHealthCheck[processorType] = Date.now();

      logger.info(`Health check successful for ${processorType}`, {
        responseTime,
        failing: response.data.failing,
        minResponseTime: response.data.minResponseTime,
        isHealthy: healthData.isHealthy,
      });

      return healthData;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordResponseTime(processorType, responseTime);
      
      const errorData = {
        failing: true,
        minResponseTime: 999999,
        responseTime,
        lastChecked: new Date().toISOString(),
        isHealthy: false,
        error: error.message,
        statusCode: error.response?.status,
      };

      // Update cache and last check time even for failures
      this.healthCache.set(processorType, errorData);
      this.lastHealthCheck[processorType] = Date.now();

      logger.error(`Health check failed for ${processorType}`, {
        error: error.message,
        responseTime,
        statusCode: error.response?.status,
        url: healthEndpoint,
      });

      return errorData;
    }
  }

  recordResponseTime(processorType, responseTime) {
    this.responseTimes[processorType].push(responseTime);
    
    // Keep only last 50 response times
    if (this.responseTimes[processorType].length > 50) {
      this.responseTimes[processorType].shift();
    }
  }

  async getAllProcessorsHealth() {
    const [defaultHealth, fallbackHealth] = await Promise.allSettled([
      this.getProcessorHealth("default"),
      this.getProcessorHealth("fallback"),
    ]);

    return {
      default: defaultHealth.status === "fulfilled" ? defaultHealth.value : {
        failing: true,
        minResponseTime: 999999,
        isHealthy: false,
        error: defaultHealth.reason?.message || "Health check failed",
      },
      fallback: fallbackHealth.status === "fulfilled" ? fallbackHealth.value : {
        failing: true,
        minResponseTime: 999999,
        isHealthy: false,
        error: fallbackHealth.reason?.message || "Health check failed",
      },
      timestamp: new Date().toISOString(),
    };
  }

  getHealthStats() {
    const stats = {};
    
    ["default", "fallback"].forEach(processorType => {
      const responseTimes = this.responseTimes[processorType];
      const cachedHealth = this.healthCache.get(processorType);
      
      stats[processorType] = {
        avgResponseTime: responseTimes.length > 0 
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
          : 0,
        p95ResponseTime: responseTimes.length > 0
          ? responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)]
          : 0,
        totalChecks: responseTimes.length,
        lastCheck: cachedHealth?.lastChecked,
        isHealthy: cachedHealth?.isHealthy || false,
        failing: cachedHealth?.failing || true,
      };
    });

    return stats;
  }

  clearCache() {
    this.healthCache.clear();
    this.lastHealthCheck = {
      default: 0,
      fallback: 0,
    };
    logger.info("Health check cache cleared");
  }

  getNextHealthCheckTime(processorType) {
    const lastCheck = this.lastHealthCheck[processorType];
    const nextCheck = lastCheck + this.healthCheckInterval;
    return new Date(nextCheck);
  }
}

module.exports = { HealthCheckService }; 