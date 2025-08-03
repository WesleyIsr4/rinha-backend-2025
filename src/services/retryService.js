const { logger } = require("../utils/logger");

class RetryService {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 10000; // 10 seconds
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.jitter = options.jitter || 0.1; // 10% jitter
    
    logger.info("Retry Service initialized", {
      maxRetries: this.maxRetries,
      baseDelay: this.baseDelay,
      maxDelay: this.maxDelay,
      backoffMultiplier: this.backoffMultiplier,
      jitter: this.jitter,
    });
  }

  async executeWithRetry(operation, context = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const startTime = Date.now();
        const result = await operation();
        const duration = Date.now() - startTime;
        
        if (attempt > 1) {
          logger.info(`Operation succeeded on attempt ${attempt}`, {
            ...context,
            attempt,
            duration,
            totalAttempts: attempt,
          });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        const isLastAttempt = attempt === this.maxRetries + 1;
        
        logger.warn(`Operation failed on attempt ${attempt}`, {
          ...context,
          attempt,
          error: error.message,
          isLastAttempt,
          statusCode: error.response?.status,
        });
        
        if (isLastAttempt) {
          logger.error(`Operation failed after ${this.maxRetries + 1} attempts`, {
            ...context,
            totalAttempts: this.maxRetries + 1,
            finalError: error.message,
          });
          throw error;
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);
        
        logger.info(`Retrying operation in ${delay}ms`, {
          ...context,
          attempt,
          nextAttempt: attempt + 1,
          delay,
        });
        
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  calculateDelay(attempt) {
    // Exponential backoff: baseDelay * (backoffMultiplier ^ (attempt - 1))
    const exponentialDelay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1);
    
    // Apply jitter to prevent thundering herd
    const jitterAmount = exponentialDelay * this.jitter;
    const jitteredDelay = exponentialDelay + (Math.random() - 0.5) * jitterAmount;
    
    // Cap at maxDelay
    return Math.min(jitteredDelay, this.maxDelay);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Specialized retry for payment processing
  async retryPayment(processorType, correlationId, amount, requestedAt, operation) {
    const context = {
      processorType,
      correlationId,
      amount,
      requestedAt,
      operation: "payment_processing",
    };
    
    return this.executeWithRetry(operation, context);
  }

  // Specialized retry for health checks
  async retryHealthCheck(processorType, operation) {
    const context = {
      processorType,
      operation: "health_check",
    };
    
    return this.executeWithRetry(operation, context);
  }

  // Get retry statistics
  getStats() {
    return {
      maxRetries: this.maxRetries,
      baseDelay: this.baseDelay,
      maxDelay: this.maxDelay,
      backoffMultiplier: this.backoffMultiplier,
      jitter: this.jitter,
    };
  }
}

module.exports = { RetryService }; 