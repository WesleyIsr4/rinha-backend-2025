const { logger } = require('../utils/logger');

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.timeout = options.timeout || 60000; // 60 seconds
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.totalRequests = 0;
    
    // Performance metrics
    this.responseTimes = [];
    this.maxResponseTime = options.maxResponseTime || 10000; // 10 seconds
    
    logger.info(`Circuit Breaker initialized for ${name}`, {
      failureThreshold: this.failureThreshold,
      timeout: this.timeout,
      monitoringPeriod: this.monitoringPeriod,
    });
  }

  async execute(operation) {
    this.totalRequests++;
    
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
        logger.info(`Circuit Breaker ${this.name} moved to HALF_OPEN state`);
      } else {
        throw new Error(`Circuit Breaker ${this.name} is OPEN`);
      }
    }

    const startTime = Date.now();
    
    try {
      const result = await operation();
      const responseTime = Date.now() - startTime;
      
      this.onSuccess(responseTime);
      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.onFailure(error, responseTime);
      throw error;
    }
  }

  onSuccess(responseTime) {
    this.failureCount = 0;
    this.successCount++;
    this.responseTimes.push(responseTime);
    
    // Keep only last 100 response times for performance tracking
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      logger.info(`Circuit Breaker ${this.name} moved to CLOSED state`);
    }
    
    logger.debug(`Circuit Breaker ${this.name} success`, {
      responseTime,
      successCount: this.successCount,
      state: this.state,
    });
  }

  onFailure(error, responseTime) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.responseTimes.push(responseTime);
    
    // Keep only last 100 response times
    if (this.responseTimes.length > 100) {
      this.responseTimes.shift();
    }
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit Breaker ${this.name} moved to OPEN state`, {
        failureCount: this.failureCount,
        error: error.message,
        responseTime,
      });
    }
    
    logger.debug(`Circuit Breaker ${this.name} failure`, {
      failureCount: this.failureCount,
      responseTime,
      error: error.message,
      state: this.state,
    });
  }

  shouldAttemptReset() {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.timeout;
  }

  getStats() {
    const avgResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length 
      : 0;
    
    const p95ResponseTime = this.responseTimes.length > 0
      ? this.responseTimes.sort((a, b) => a - b)[Math.floor(this.responseTimes.length * 0.95)]
      : 0;
    
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      successRate: this.totalRequests > 0 ? (this.successCount / this.totalRequests) * 100 : 0,
      avgResponseTime,
      p95ResponseTime,
      lastFailureTime: this.lastFailureTime,
      isHealthy: this.state === 'CLOSED' && this.failureCount < this.failureThreshold,
      responseTimes: this.responseTimes, // Add this for testing
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.responseTimes = [];
    logger.info(`Circuit Breaker ${this.name} manually reset`);
  }
}

module.exports = { CircuitBreaker }; 