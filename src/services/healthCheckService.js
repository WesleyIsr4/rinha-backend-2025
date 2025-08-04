const axios = require("axios");
const { logger } = require("../utils/logger");
const { DatabaseService } = require("./databaseService");

class HealthCheckService {
  constructor() {
    this.defaultProcessor = "http://payment-processor-default:8080";
    this.fallbackProcessor = "http://payment-processor-fallback:8080";
    
    // Cache for health check results (fallback to memory if Redis fails)
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

    // Redis cache keys
    this.redisKeys = {
      healthCache: "health:cache",
      lastHealthCheck: "health:last_check",
      responseTimes: "health:response_times",
    };

    // Initialize Redis connection
    this.initializeRedis();
    
    logger.info("Health Check Service initialized", {
      defaultProcessor: this.defaultProcessor,
      fallbackProcessor: this.fallbackProcessor,
      healthCheckInterval: this.healthCheckInterval,
      healthCheckTimeout: this.healthCheckTimeout,
    });
  }

  async initializeRedis() {
    try {
      this.redis = await DatabaseService.getRedisClient();
      logger.info("Redis connection established for health check cache");
    } catch (error) {
      logger.warn("Failed to connect to Redis, using memory cache", {
        error: error.message,
      });
      this.redis = null;
    }
  }

  async getProcessorHealth(processorType) {
    const now = Date.now();
    const lastCheck = await this.getLastHealthCheckTime(processorType);
    
    // Check if we can make a new health check (rate limiting)
    if (now - lastCheck < this.healthCheckInterval) {
      const cachedHealth = await this.getCachedHealth(processorType);
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

  async getCachedHealth(processorType) {
    try {
      if (this.redis) {
        const cached = await this.redis.hget(this.redisKeys.healthCache, processorType);
        return cached ? JSON.parse(cached) : null;
      } else {
        return this.healthCache.get(processorType) || null;
      }
    } catch (error) {
      logger.warn("Failed to get cached health from Redis, using memory cache", {
        processorType,
        error: error.message,
      });
      return this.healthCache.get(processorType) || null;
    }
  }

  async setCachedHealth(processorType, healthData) {
    try {
      if (this.redis) {
        await this.redis.hset(this.redisKeys.healthCache, processorType, JSON.stringify(healthData));
        // Set TTL for cache entries (1 hour)
        await this.redis.expire(this.redisKeys.healthCache, 3600);
      } else {
        this.healthCache.set(processorType, healthData);
      }
    } catch (error) {
      logger.warn("Failed to set cached health in Redis, using memory cache", {
        processorType,
        error: error.message,
      });
      this.healthCache.set(processorType, healthData);
    }
  }

  async getLastHealthCheckTime(processorType) {
    try {
      if (this.redis) {
        const lastCheck = await this.redis.hget(this.redisKeys.lastHealthCheck, processorType);
        return lastCheck ? parseInt(lastCheck) : 0;
      } else {
        return this.lastHealthCheck[processorType] || 0;
      }
    } catch (error) {
      logger.warn("Failed to get last health check time from Redis, using memory", {
        processorType,
        error: error.message,
      });
      return this.lastHealthCheck[processorType] || 0;
    }
  }

  async setLastHealthCheckTime(processorType, timestamp) {
    try {
      if (this.redis) {
        await this.redis.hset(this.redisKeys.lastHealthCheck, processorType, timestamp.toString());
        // Set TTL for last check times (1 hour)
        await this.redis.expire(this.redisKeys.lastHealthCheck, 3600);
      } else {
        this.lastHealthCheck[processorType] = timestamp;
      }
    } catch (error) {
      logger.warn("Failed to set last health check time in Redis, using memory", {
        processorType,
        error: error.message,
      });
      this.lastHealthCheck[processorType] = timestamp;
    }
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
      await this.recordResponseTime(processorType, responseTime);
      
      const healthData = {
        ...response.data,
        responseTime,
        lastChecked: new Date().toISOString(),
        isHealthy: !response.data.failing,
      };

      // Update cache and last check time
      await this.setCachedHealth(processorType, healthData);
      await this.setLastHealthCheckTime(processorType, Date.now());

      logger.info(`Health check successful for ${processorType}`, {
        responseTime,
        failing: response.data.failing,
        minResponseTime: response.data.minResponseTime,
        isHealthy: healthData.isHealthy,
      });

      return healthData;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await this.recordResponseTime(processorType, responseTime);
      
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
      await this.setCachedHealth(processorType, errorData);
      await this.setLastHealthCheckTime(processorType, Date.now());

      logger.error(`Health check failed for ${processorType}`, {
        error: error.message,
        responseTime,
        statusCode: error.response?.status,
        url: healthEndpoint,
      });

      return errorData;
    }
  }

  async recordResponseTime(processorType, responseTime) {
    try {
      if (this.redis) {
        const key = `${this.redisKeys.responseTimes}:${processorType}`;
        await this.redis.lpush(key, responseTime.toString());
        // Keep only last 50 response times
        await this.redis.ltrim(key, 0, 49);
        // Set TTL for response times (1 hour)
        await this.redis.expire(key, 3600);
      } else {
        this.responseTimes[processorType].push(responseTime);
        
        // Keep only last 50 response times
        if (this.responseTimes[processorType].length > 50) {
          this.responseTimes[processorType].shift();
        }
      }
    } catch (error) {
      logger.warn("Failed to record response time in Redis, using memory", {
        processorType,
        error: error.message,
      });
      this.responseTimes[processorType].push(responseTime);
      
      // Keep only last 50 response times
      if (this.responseTimes[processorType].length > 50) {
        this.responseTimes[processorType].shift();
      }
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

  async getHealthStats() {
    const stats = {};
    
    for (const processorType of ["default", "fallback"]) {
      const responseTimes = await this.getResponseTimes(processorType);
      const cachedHealth = await this.getCachedHealth(processorType);
      
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
    }

    return stats;
  }

  async getResponseTimes(processorType) {
    try {
      if (this.redis) {
        const key = `${this.redisKeys.responseTimes}:${processorType}`;
        const times = await this.redis.lrange(key, 0, -1);
        return times.map(t => parseInt(t));
      } else {
        return this.responseTimes[processorType] || [];
      }
    } catch (error) {
      logger.warn("Failed to get response times from Redis, using memory", {
        processorType,
        error: error.message,
      });
      return this.responseTimes[processorType] || [];
    }
  }

  async clearCache() {
    try {
      if (this.redis) {
        await this.redis.del(this.redisKeys.healthCache);
        await this.redis.del(this.redisKeys.lastHealthCheck);
        await this.redis.del(`${this.redisKeys.responseTimes}:default`);
        await this.redis.del(`${this.redisKeys.responseTimes}:fallback`);
      } else {
        this.healthCache.clear();
        this.lastHealthCheck = {
          default: 0,
          fallback: 0,
        };
      }
      logger.info("Health check cache cleared");
    } catch (error) {
      logger.error("Failed to clear health check cache", {
        error: error.message,
      });
      // Fallback to memory cache clear
      this.healthCache.clear();
      this.lastHealthCheck = {
        default: 0,
        fallback: 0,
      };
    }
  }

  async getNextHealthCheckTime(processorType) {
    const lastCheck = await this.getLastHealthCheckTime(processorType);
    const nextCheck = lastCheck + this.healthCheckInterval;
    return new Date(nextCheck);
  }
}

module.exports = { HealthCheckService }; 