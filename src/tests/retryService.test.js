const { RetryService } = require("../services/retryService");

describe("RetryService", () => {
  let retryService;

  beforeEach(() => {
    retryService = new RetryService({
      maxRetries: 2,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: 0.1,
    });
  });

  describe("Initialization", () => {
    it("should initialize with correct configuration", () => {
      expect(retryService.maxRetries).toBe(2);
      expect(retryService.baseDelay).toBe(100);
      expect(retryService.maxDelay).toBe(1000);
      expect(retryService.backoffMultiplier).toBe(2);
      expect(retryService.jitter).toBe(0.1);
    });

    it("should use default configuration", () => {
      const defaultRetryService = new RetryService();
      expect(defaultRetryService.maxRetries).toBe(3);
      expect(defaultRetryService.baseDelay).toBe(1000);
      expect(defaultRetryService.maxDelay).toBe(10000);
    });
  });

  describe("Successful operations", () => {
    it("should execute successful operation on first try", async () => {
      const operation = jest.fn().mockResolvedValue("success");

      const result = await retryService.executeWithRetry(operation);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should execute successful operation after retries", async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("first failure"))
        .mockRejectedValueOnce(new Error("second failure"))
        .mockResolvedValue("success");

      const result = await retryService.executeWithRetry(operation);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe("Failed operations", () => {
    it("should throw error after max retries", async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error("persistent failure"));

      try {
        await retryService.executeWithRetry(operation);
        fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).toBe("persistent failure");
        expect(operation).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      }
    });

    it("should throw the last error encountered", async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("first error"))
        .mockRejectedValueOnce(new Error("second error"))
        .mockRejectedValueOnce(new Error("final error"));

      try {
        await retryService.executeWithRetry(operation);
        fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).toBe("final error");
        expect(operation).toHaveBeenCalledTimes(3);
      }
    });
  });

  describe("Delay calculation", () => {
    it("should calculate exponential backoff with jitter", async () => {
      const operation = jest.fn().mockRejectedValue(new Error("failure"));

      const startTime = Date.now();

      try {
        await retryService.executeWithRetry(operation);
        fail("Should have thrown an error");
      } catch (error) {
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Should have waited for delays between retries
        // First delay: ~100ms, Second delay: ~200ms
        expect(totalTime).toBeGreaterThan(250);
        expect(operation).toHaveBeenCalledTimes(3);
      }
    });

    it("should respect max delay", async () => {
      const retryServiceWithHighDelay = new RetryService({
        maxRetries: 1,
        baseDelay: 2000, // Higher than maxDelay
        maxDelay: 1000,
      });

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("failure"))
        .mockResolvedValue("success");

      const startTime = Date.now();

      await retryServiceWithHighDelay.executeWithRetry(operation);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should not exceed maxDelay significantly
      expect(totalTime).toBeLessThan(1500);
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe("Specialized retry methods", () => {
    it("should retry payment processing", async () => {
      const operation = jest.fn().mockResolvedValue("payment success");

      const result = await retryService.retryPayment(
        "default",
        "test-correlation-id",
        100.5,
        "2025-08-03T20:00:00Z",
        operation
      );

      expect(result).toBe("payment success");
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should retry health check", async () => {
      const operation = jest.fn().mockResolvedValue("health success");

      const result = await retryService.retryHealthCheck("default", operation);

      expect(result).toBe("health success");
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe("Context tracking", () => {
    it("should pass context to operation", async () => {
      const operation = jest.fn().mockResolvedValue("success");
      const context = { processorType: "default", correlationId: "test-123" };

      await retryService.executeWithRetry(operation, context);

      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe("Statistics", () => {
    it("should provide retry statistics", () => {
      const stats = retryService.getStats();

      expect(stats).toEqual({
        maxRetries: 2,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitter: 0.1,
      });
    });
  });

  describe("Edge cases", () => {
    it("should handle zero max retries", async () => {
      const zeroRetryService = new RetryService({ maxRetries: 0 });
      const operation = jest.fn().mockRejectedValue(new Error("failure"));

      try {
        await zeroRetryService.executeWithRetry(operation);
        fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).toBe("failure");
        expect(operation).toHaveBeenCalledTimes(1); // Still tries once even with maxRetries 0
      }
    }, 10000); // Increase timeout for this test

    it("should handle very short delays", async () => {
      const fastRetryService = new RetryService({
        maxRetries: 1,
        baseDelay: 10,
        maxDelay: 50,
      });

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error("failure"))
        .mockResolvedValue("success");

      const startTime = Date.now();

      await fastRetryService.executeWithRetry(operation);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(100);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it("should handle operations that throw different error types", async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new TypeError("type error"))
        .mockRejectedValueOnce(new ReferenceError("reference error"))
        .mockResolvedValue("success");

      const result = await retryService.executeWithRetry(operation);

      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe("Sleep function", () => {
    it("should sleep for specified duration", async () => {
      const startTime = Date.now();

      await retryService.sleep(100);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeGreaterThanOrEqual(90);
      expect(duration).toBeLessThan(150);
    });
  });
});
