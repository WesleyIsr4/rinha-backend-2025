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
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
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
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Try successful operation
      const successOperation = jest.fn().mockResolvedValue("success");
      const result = await circuitBreaker.execute(successOperation);
      
      expect(result).toBe("success");
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("CLOSED");
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(1);
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
    });
  });
}); 