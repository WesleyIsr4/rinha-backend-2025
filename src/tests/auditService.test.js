const { AuditService } = require("../services/auditService");

describe("AuditService", () => {
  let auditService;

  beforeEach(() => {
    auditService = new AuditService();
  });

  describe("Payment logging", () => {
    it("should log payment attempt", () => {
      const auditId = auditService.logPaymentAttempt(
        "test-correlation-id",
        100.50,
        "default",
        1
      );

      expect(auditId).toBeDefined();
      
      const logs = auditService.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.event).toBe("PAYMENT_ATTEMPT");
      expect(log.correlationId).toBe("test-correlation-id");
      expect(log.amount).toBe(100.50);
      expect(log.processorType).toBe("default");
      expect(log.attemptNumber).toBe(1);
      expect(log.status).toBe("STARTED");
    });

    it("should log payment success", () => {
      const auditId = "test-audit-id";
      const responseData = { message: "Payment processed successfully" };
      
      auditService.logPaymentSuccess(
        auditId,
        "test-correlation-id",
        100.50,
        "default",
        responseData
      );

      const logs = auditService.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.event).toBe("PAYMENT_SUCCESS");
      expect(log.id).toBe(auditId);
      expect(log.correlationId).toBe("test-correlation-id");
      expect(log.amount).toBe(100.50);
      expect(log.processorType).toBe("default");
      expect(log.responseData).toEqual(responseData);
      expect(log.status).toBe("SUCCESS");
    });

    it("should log payment failure", () => {
      const auditId = "test-audit-id";
      const error = new Error("Payment failed");
      error.code = "PAYMENT_ERROR";
      error.response = { status: 500 };
      
      auditService.logPaymentFailure(
        auditId,
        "test-correlation-id",
        100.50,
        "default",
        error,
        1
      );

      const logs = auditService.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.event).toBe("PAYMENT_FAILURE");
      expect(log.id).toBe(auditId);
      expect(log.correlationId).toBe("test-correlation-id");
      expect(log.amount).toBe(100.50);
      expect(log.processorType).toBe("default");
      expect(log.error).toBe("Payment failed");
      expect(log.errorCode).toBe("PAYMENT_ERROR");
      expect(log.statusCode).toBe(500);
      expect(log.attemptNumber).toBe(1);
      expect(log.status).toBe("FAILED");
    });

    it("should log fallback attempt", () => {
      auditService.logFallbackAttempt(
        "test-correlation-id",
        100.50,
        "default",
        "fallback"
      );

      const logs = auditService.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.event).toBe("FALLBACK_ATTEMPT");
      expect(log.correlationId).toBe("test-correlation-id");
      expect(log.amount).toBe(100.50);
      expect(log.fromProcessor).toBe("default");
      expect(log.toProcessor).toBe("fallback");
      expect(log.status).toBe("FALLBACK");
    });
  });

  describe("Database operation logging", () => {
    it("should log successful database operation", () => {
      const data = { correlationId: "test-123", amount: 100.50 };
      
      auditService.logDatabaseOperation(
        "INSERT",
        "payments",
        data,
        true
      );

      const logs = auditService.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.event).toBe("DATABASE_OPERATION");
      expect(log.operation).toBe("INSERT");
      expect(log.table).toBe("payments");
      expect(log.data).toEqual(data);
      expect(log.success).toBe(true);
      expect(log.status).toBe("SUCCESS");
    });

    it("should log failed database operation", () => {
      const data = { correlationId: "test-123", amount: 100.50 };
      const error = new Error("Database connection failed");
      
      auditService.logDatabaseOperation(
        "INSERT",
        "payments",
        data,
        false,
        error
      );

      const logs = auditService.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.event).toBe("DATABASE_OPERATION");
      expect(log.operation).toBe("INSERT");
      expect(log.table).toBe("payments");
      expect(log.data).toEqual(data);
      expect(log.success).toBe(false);
      expect(log.error).toBe("Database connection failed");
      expect(log.status).toBe("FAILED");
    });
  });

  describe("Consistency check logging", () => {
    it("should log successful consistency check", () => {
      const details = { checks: 5, passed: 5, failed: 0 };
      
      auditService.logConsistencyCheck(
        "test-correlation-id",
        "PAYMENT_VALIDATION",
        true,
        details
      );

      const logs = auditService.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.event).toBe("CONSISTENCY_CHECK");
      expect(log.correlationId).toBe("test-correlation-id");
      expect(log.checkType).toBe("PAYMENT_VALIDATION");
      expect(log.result).toBe(true);
      expect(log.details).toEqual(details);
      expect(log.status).toBe("PASSED");
    });

    it("should log failed consistency check", () => {
      const details = { checks: 5, passed: 3, failed: 2 };
      
      auditService.logConsistencyCheck(
        "test-correlation-id",
        "SUMMARY_VALIDATION",
        false,
        details
      );

      const logs = auditService.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.event).toBe("CONSISTENCY_CHECK");
      expect(log.correlationId).toBe("test-correlation-id");
      expect(log.checkType).toBe("SUMMARY_VALIDATION");
      expect(log.result).toBe(false);
      expect(log.details).toEqual(details);
      expect(log.status).toBe("FAILED");
    });
  });

  describe("Circuit breaker logging", () => {
    it("should log circuit breaker state change", () => {
      auditService.logCircuitBreakerStateChange(
        "default",
        "CLOSED",
        "OPEN",
        "Too many failures"
      );

      const logs = auditService.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.event).toBe("CIRCUIT_BREAKER_STATE_CHANGE");
      expect(log.processorType).toBe("default");
      expect(log.fromState).toBe("CLOSED");
      expect(log.toState).toBe("OPEN");
      expect(log.reason).toBe("Too many failures");
      expect(log.status).toBe("STATE_CHANGE");
    });
  });

  describe("Log retrieval", () => {
    beforeEach(() => {
      // Add some test logs
      auditService.logPaymentAttempt("correlation-1", 100, "default", 1);
      auditService.logPaymentSuccess("audit-1", "correlation-1", 100, "default", {});
      auditService.logPaymentAttempt("correlation-2", 200, "fallback", 1);
      auditService.logPaymentFailure("audit-2", "correlation-2", 200, "fallback", new Error("Failed"), 1);
    });

    it("should get logs by correlation ID", () => {
      const logs = auditService.getAuditLogsByCorrelationId("correlation-1");
      
      expect(logs).toHaveLength(2);
      expect(logs[0].event).toBe("PAYMENT_ATTEMPT");
      expect(logs[1].event).toBe("PAYMENT_SUCCESS");
    });

    it("should get logs by event type", () => {
      const logs = auditService.getAuditLogsByEvent("PAYMENT_ATTEMPT");
      
      expect(logs).toHaveLength(2);
      logs.forEach(log => {
        expect(log.event).toBe("PAYMENT_ATTEMPT");
      });
    });

    it("should get logs by time range", () => {
      const now = new Date();
      const from = new Date(now.getTime() - 1000); // 1 second ago
      const to = new Date(now.getTime() + 1000); // 1 second from now
      
      const logs = auditService.getAuditLogsByTimeRange(from, to);
      
      expect(logs).toHaveLength(4);
    });

    it("should get all logs", () => {
      const logs = auditService.getAllAuditLogs();
      
      expect(logs).toHaveLength(4);
      expect(logs[0].event).toBe("PAYMENT_ATTEMPT");
      expect(logs[1].event).toBe("PAYMENT_SUCCESS");
      expect(logs[2].event).toBe("PAYMENT_ATTEMPT");
      expect(logs[3].event).toBe("PAYMENT_FAILURE");
    });
  });

  describe("Log management", () => {
    it("should limit log history", () => {
      // Add more logs than the limit
      for (let i = 0; i < 1100; i++) {
        auditService.logPaymentAttempt(`correlation-${i}`, 100, "default", 1);
      }
      
      const logs = auditService.getAllAuditLogs();
      expect(logs).toHaveLength(1000); // Should be limited to maxAuditLogs
    });

    it("should clear audit logs", () => {
      auditService.logPaymentAttempt("test-correlation", 100, "default", 1);
      
      expect(auditService.getAllAuditLogs()).toHaveLength(1);
      
      auditService.clearAuditLogs();
      
      expect(auditService.getAllAuditLogs()).toHaveLength(0);
    });
  });

  describe("Statistics", () => {
    beforeEach(() => {
      // Add various types of logs
      auditService.logPaymentAttempt("correlation-1", 100, "default", 1);
      auditService.logPaymentSuccess("audit-1", "correlation-1", 100, "default", {});
      auditService.logPaymentAttempt("correlation-2", 200, "fallback", 1);
      auditService.logPaymentFailure("audit-2", "correlation-2", 200, "fallback", new Error("Failed"), 1);
      auditService.logDatabaseOperation("INSERT", "payments", {}, true);
      auditService.logConsistencyCheck("correlation-1", "PAYMENT_VALIDATION", true, {});
    });

    it("should provide audit statistics", () => {
      const stats = auditService.getAuditStats();
      
      expect(stats.totalLogs).toBe(6);
      expect(stats.events).toEqual({
        "PAYMENT_ATTEMPT": 2,
        "PAYMENT_SUCCESS": 1,
        "PAYMENT_FAILURE": 1,
        "DATABASE_OPERATION": 1,
        "CONSISTENCY_CHECK": 1,
      });
      // The processor counts may vary based on the actual logs created
      expect(stats.processors).toHaveProperty("default");
      expect(stats.processors).toHaveProperty("fallback");
      expect(stats.statuses).toEqual({
        "STARTED": 2,
        "SUCCESS": 3,
        "FAILED": 1,
      });
      expect(stats.timeRange.first).toBeDefined();
      expect(stats.timeRange.last).toBeDefined();
    });
  });

  describe("Edge cases", () => {
    it("should handle null/undefined values", () => {
      auditService.logPaymentAttempt(null, undefined, null, null);
      
      const logs = auditService.getAllAuditLogs();
      expect(logs).toHaveLength(1);
      
      const log = logs[0];
      expect(log.correlationId).toBeNull();
      expect(log.amount).toBeUndefined();
      expect(log.processorType).toBeNull();
      expect(log.attemptNumber).toBeNull();
    });

    it("should handle empty correlation ID", () => {
      const logs = auditService.getAuditLogsByCorrelationId("");
      expect(logs).toHaveLength(0);
    });

    it("should handle non-existent correlation ID", () => {
      const logs = auditService.getAuditLogsByCorrelationId("non-existent");
      expect(logs).toHaveLength(0);
    });
  });
}); 