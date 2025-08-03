const { CircuitBreaker } = require("../services/circuitBreaker");

describe("CircuitBreaker", () => {
  let circuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker("test-processor", {
      failureThreshold: 3,
      timeout: 1000, // 1 second for testing
    });
  });

  describe("Initial state", () => {
    it("should start in CLOSED state", () => {
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("CLOSED");
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });

  describe("Successful operations", () => {
    it("should execute successful operations", async () => {
      const operation = jest.fn().mockResolvedValue("success");
      
      const result = await circuitBreaker.execute(operation);
      
      expect(result).toBe("success");
      expect(operation).toHaveBeenCalledTimes(1);
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("CLOSED");
      expect(stats.successCount).toBe(1);
      expect(stats.failureCount).toBe(0);
      expect(stats.totalRequests).toBe(1);
      expect(stats.successRate).toBe(100);
    });

    it("should track response times", async () => {
      const operation = jest.fn().mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve("success"), 100);
        });
      });
      
      await circuitBreaker.execute(operation);
      
      const stats = circuitBreaker.getStats();
      expect(stats.avgResponseTime).toBeGreaterThan(0);
      expect(stats.p95ResponseTime).toBeGreaterThan(0);
      expect(stats.responseTimes).toHaveLength(1);
    });

    it("should maintain response time history", async () => {
      const operation = jest.fn().mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve("success"), 50);
        });
      });
      
      // Execute multiple operations
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.execute(operation);
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.responseTimes).toHaveLength(5);
      expect(stats.avgResponseTime).toBeGreaterThan(0);
      expect(stats.p95ResponseTime).toBeGreaterThan(0);
    });
  });

  describe("Failed operations", () => {
    it("should track failures and remain CLOSED under threshold", async () => {
      const operation = jest.fn().mockRejectedValue(new Error("test error"));
      
      // Try 2 times (under threshold of 3)
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("CLOSED");
      expect(stats.failureCount).toBe(2);
      expect(stats.successCount).toBe(0);
      expect(stats.totalRequests).toBe(2);
      expect(stats.successRate).toBe(0);
    });

    it("should open circuit after reaching failure threshold", async () => {
      const operation = jest.fn().mockRejectedValue(new Error("test error"));
      
      // Try 3 times (at threshold)
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("OPEN");
      expect(stats.failureCount).toBe(3);
      expect(stats.totalRequests).toBe(3);
      expect(stats.successRate).toBe(0);
    });

    it("should reject operations when circuit is OPEN", async () => {
      const operation = jest.fn().mockRejectedValue(new Error("test error"));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Try to execute when circuit is OPEN
      const successOperation = jest.fn().mockResolvedValue("success");
      
      try {
        await circuitBreaker.execute(successOperation);
        fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).toContain("Circuit Breaker test-processor is OPEN");
        expect(successOperation).not.toHaveBeenCalled();
      }
    });

    it("should track failure response times", async () => {
      const operation = jest.fn().mockRejectedValue(new Error("test error"));
      
      try {
        await circuitBreaker.execute(operation);
      } catch (error) {
        // Expected to fail
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.responseTimes).toHaveLength(1);
      expect(stats.avgResponseTime).toBeGreaterThan(0);
    });
  });

  describe("Half-open state", () => {
    it("should move to HALF_OPEN after timeout", async () => {
      const operation = jest.fn().mockRejectedValue(new Error("test error"));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Wait for timeout (increase wait time to ensure timeout is reached)
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("HALF_OPEN");
    });

    it("should close circuit on successful operation in HALF_OPEN", async () => {
      const operation = jest.fn().mockRejectedValue(new Error("test error"));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      // Try successful operation
      const successOperation = jest.fn().mockResolvedValue("success");
      const result = await circuitBreaker.execute(successOperation);
      
      expect(result).toBe("success");
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("CLOSED");
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(1);
    });

    it("should open circuit again on failure in HALF_OPEN", async () => {
      const operation = jest.fn().mockRejectedValue(new Error("test error"));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      // Try failed operation in HALF_OPEN
      const failedOperation = jest.fn().mockRejectedValue(new Error("test error"));
      try {
        await circuitBreaker.execute(failedOperation);
      } catch (error) {
        // Expected to fail
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("OPEN");
      expect(stats.failureCount).toBe(4);
    });
  });

  describe("Reset functionality", () => {
    it("should reset circuit breaker state", async () => {
      const operation = jest.fn().mockRejectedValue(new Error("test error"));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      expect(circuitBreaker.getStats().state).toBe("OPEN");
      
      // Reset
      circuitBreaker.reset();
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("CLOSED");
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.responseTimes).toEqual([]);
      // Note: totalRequests is not reset as it's used for statistics
      expect(stats.successRate).toBe(0);
    });

    it("should reset last failure time", async () => {
      const operation = jest.fn().mockRejectedValue(new Error("test error"));
      
      try {
        await circuitBreaker.execute(operation);
      } catch (error) {
        // Expected to fail
      }
      
      expect(circuitBreaker.getStats().lastFailureTime).not.toBeNull();
      
      circuitBreaker.reset();
      
      expect(circuitBreaker.getStats().lastFailureTime).toBeNull();
    });
  });

  describe("Statistics", () => {
    it("should calculate success rate correctly", async () => {
      const successOperation = jest.fn().mockResolvedValue("success");
      const failedOperation = jest.fn().mockRejectedValue(new Error("test error"));
      
      // 2 successful operations
      await circuitBreaker.execute(successOperation);
      await circuitBreaker.execute(successOperation);
      
      // 1 failed operation
      try {
        await circuitBreaker.execute(failedOperation);
      } catch (error) {
        // Expected to fail
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(1);
      expect(stats.successRate).toBeCloseTo(66.67, 1);
    });

    it("should track isHealthy status", async () => {
      const stats = circuitBreaker.getStats();
      expect(stats.isHealthy).toBe(true);
      
      // Fail once (under threshold)
      const operation = jest.fn().mockRejectedValue(new Error("test error"));
      try {
        await circuitBreaker.execute(operation);
      } catch (error) {
        // Expected to fail
      }
      
      const statsAfterFailure = circuitBreaker.getStats();
      expect(statsAfterFailure.isHealthy).toBe(true);
      
      // Fail twice more to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(operation);
        } catch (error) {
          // Expected to fail
        }
      }
      
      const statsAfterOpen = circuitBreaker.getStats();
      expect(statsAfterOpen.isHealthy).toBe(false);
    });
  });
}); 