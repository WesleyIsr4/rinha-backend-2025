const { logger } = require("../utils/logger");
const { v4: uuidv4 } = require("uuid");

class AuditService {
  constructor() {
    this.auditLogs = [];
    this.maxAuditLogs = 1000; // Keep last 1000 audit logs in memory
  }

  // Log payment processing attempt
  logPaymentAttempt(correlationId, amount, processorType, attemptNumber = 1) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      event: "PAYMENT_ATTEMPT",
      correlationId,
      amount,
      processorType,
      attemptNumber,
      status: "STARTED",
    };

    this.addAuditLog(auditEntry);
    logger.info("Payment attempt logged", auditEntry);
    return auditEntry.id;
  }

  // Log payment success
  logPaymentSuccess(
    auditId,
    correlationId,
    amount,
    processorType,
    responseData
  ) {
    const auditEntry = {
      id: auditId || uuidv4(),
      timestamp: new Date().toISOString(),
      event: "PAYMENT_SUCCESS",
      correlationId,
      amount,
      processorType,
      responseData,
      status: "SUCCESS",
    };

    this.addAuditLog(auditEntry);
    logger.info("Payment success logged", auditEntry);
    return auditEntry.id;
  }

  // Log payment failure
  logPaymentFailure(
    auditId,
    correlationId,
    amount,
    processorType,
    error,
    attemptNumber
  ) {
    const auditEntry = {
      id: auditId || uuidv4(),
      timestamp: new Date().toISOString(),
      event: "PAYMENT_FAILURE",
      correlationId,
      amount,
      processorType,
      error: error.message,
      errorCode: error.code,
      statusCode: error.response?.status,
      attemptNumber,
      status: "FAILED",
    };

    this.addAuditLog(auditEntry);
    logger.error("Payment failure logged", auditEntry);
    return auditEntry.id;
  }

  // Log fallback attempt
  logFallbackAttempt(correlationId, amount, fromProcessor, toProcessor) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      event: "FALLBACK_ATTEMPT",
      correlationId,
      amount,
      fromProcessor,
      toProcessor,
      status: "FALLBACK",
    };

    this.addAuditLog(auditEntry);
    logger.warn("Fallback attempt logged", auditEntry);
    return auditEntry.id;
  }

  // Log database operation
  logDatabaseOperation(operation, table, data, success, error = null) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      event: "DATABASE_OPERATION",
      operation,
      table,
      data,
      success,
      error: error?.message,
      status: success ? "SUCCESS" : "FAILED",
    };

    this.addAuditLog(auditEntry);

    if (success) {
      logger.info("Database operation logged", auditEntry);
    } else {
      logger.error("Database operation failed", auditEntry);
    }

    return auditEntry.id;
  }

  // Log consistency check
  logConsistencyCheck(correlationId, checkType, result, details) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      event: "CONSISTENCY_CHECK",
      correlationId,
      checkType,
      result,
      details,
      status: result ? "PASSED" : "FAILED",
    };

    this.addAuditLog(auditEntry);

    if (result) {
      logger.info("Consistency check passed", auditEntry);
    } else {
      logger.warn("Consistency check failed", auditEntry);
    }

    return auditEntry.id;
  }

  // Log circuit breaker state change
  logCircuitBreakerStateChange(processorType, fromState, toState, reason) {
    const auditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      event: "CIRCUIT_BREAKER_STATE_CHANGE",
      processorType,
      fromState,
      toState,
      reason,
      status: "STATE_CHANGE",
    };

    this.addAuditLog(auditEntry);
    logger.info("Circuit breaker state change logged", auditEntry);
    return auditEntry.id;
  }

  // Add audit log to memory (with size limit)
  addAuditLog(auditEntry) {
    this.auditLogs.push(auditEntry);

    // Keep only last maxAuditLogs entries
    if (this.auditLogs.length > this.maxAuditLogs) {
      this.auditLogs = this.auditLogs.slice(-this.maxAuditLogs);
    }
  }

  // Get audit logs for a specific correlation ID
  getAuditLogsByCorrelationId(correlationId) {
    return this.auditLogs.filter((log) => log.correlationId === correlationId);
  }

  // Get audit logs for a specific time range
  getAuditLogsByTimeRange(from, to) {
    return this.auditLogs.filter((log) => {
      const logTime = new Date(log.timestamp);
      return logTime >= from && logTime <= to;
    });
  }

  // Get audit logs by event type
  getAuditLogsByEvent(event) {
    return this.auditLogs.filter((log) => log.event === event);
  }

  // Get all audit logs (for debugging)
  getAllAuditLogs() {
    return this.auditLogs;
  }

  // Get audit statistics
  getAuditStats() {
    const stats = {
      totalLogs: this.auditLogs.length,
      events: {},
      processors: {},
      statuses: {},
      timeRange: {
        first: this.auditLogs.length > 0 ? this.auditLogs[0].timestamp : null,
        last:
          this.auditLogs.length > 0
            ? this.auditLogs[this.auditLogs.length - 1].timestamp
            : null,
      },
    };

    this.auditLogs.forEach((log) => {
      // Count events
      stats.events[log.event] = (stats.events[log.event] || 0) + 1;

      // Count processors
      if (log.processorType) {
        stats.processors[log.processorType] =
          (stats.processors[log.processorType] || 0) + 1;
      }

      // Count statuses
      stats.statuses[log.status] = (stats.statuses[log.status] || 0) + 1;
    });

    return stats;
  }

  // Clear audit logs (for testing)
  clearAuditLogs() {
    this.auditLogs = [];
    logger.info("Audit logs cleared");
  }
}

module.exports = { AuditService };
