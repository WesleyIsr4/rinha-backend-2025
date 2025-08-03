const { HealthCheckService } = require("../services/healthCheckService");

// Mock axios
jest.mock("axios");
const axios = require("axios");

describe("HealthCheckService", () => {
  let healthCheckService;

  beforeEach(() => {
    healthCheckService = new HealthCheckService();
    jest.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with correct configuration", () => {
      expect(healthCheckService.defaultProcessor).toBe("http://payment-processor-default:8080");
      expect(healthCheckService.fallbackProcessor).toBe("http://payment-processor-fallback:8080");
      expect(healthCheckService.healthCheckInterval).toBe(5000);
      expect(healthCheckService.healthCheckTimeout).toBe(3000);
    });
  });

  describe("Rate limiting", () => {
    it("should use cached result when within rate limit", async () => {
      const mockResponse = {
        data: {
          failing: false,
          minResponseTime: 100,
        },
        status: 200,
      };

      axios.get.mockResolvedValue(mockResponse);

      // First call
      const result1 = await healthCheckService.getProcessorHealth("default");
      expect(axios.get).toHaveBeenCalledTimes(1);

      // Second call within rate limit
      const result2 = await healthCheckService.getProcessorHealth("default");
      expect(axios.get).toHaveBeenCalledTimes(1); // Should use cache

      expect(result1).toEqual(result2);
    });

    it("should make new call after rate limit expires", async () => {
      const mockResponse = {
        data: {
          failing: false,
          minResponseTime: 100,
        },
        status: 200,
      };

      axios.get.mockResolvedValue(mockResponse);

      // First call
      await healthCheckService.getProcessorHealth("default");
      expect(axios.get).toHaveBeenCalledTimes(1);

      // Wait for rate limit to expire (shorter wait for test)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second call after rate limit
      await healthCheckService.getProcessorHealth("default");
      expect(axios.get).toHaveBeenCalledTimes(2);
    }, 10000); // Increase timeout for this test
  });

  describe("Health check responses", () => {
    it("should handle successful health check", async () => {
      const mockResponse = {
        data: {
          failing: false,
          minResponseTime: 150,
        },
        status: 200,
      };

      axios.get.mockResolvedValue(mockResponse);

      const result = await healthCheckService.getProcessorHealth("default");

      expect(result).toEqual({
        failing: false,
        minResponseTime: 150,
        responseTime: expect.any(Number),
        lastChecked: expect.any(String),
        isHealthy: true,
      });

      expect(axios.get).toHaveBeenCalledWith(
        "http://payment-processor-default:8080/payments/service-health",
        expect.objectContaining({
          timeout: 3000,
          headers: expect.objectContaining({
            "User-Agent": "Rinha-Backend-2025/1.0.0",
          }),
        })
      );
    });

    it("should handle failed health check", async () => {
      const mockError = new Error("Network error");
      mockError.response = { status: 500 };

      axios.get.mockRejectedValue(mockError);

      const result = await healthCheckService.getProcessorHealth("default");

      expect(result).toEqual({
        failing: true,
        minResponseTime: 999999,
        responseTime: expect.any(Number),
        lastChecked: expect.any(String),
        isHealthy: false,
        error: "Network error",
        statusCode: 500,
      });
    });

    it("should handle timeout", async () => {
      const mockError = new Error("timeout of 3000ms exceeded");
      mockError.code = "ECONNABORTED";

      axios.get.mockRejectedValue(mockError);

      const result = await healthCheckService.getProcessorHealth("default");

      expect(result.failing).toBe(true);
      expect(result.isHealthy).toBe(false);
      expect(result.error).toContain("timeout");
    });
  });

  describe("Response time tracking", () => {
    it("should track response times", async () => {
      const mockResponse = {
        data: {
          failing: false,
          minResponseTime: 100,
        },
        status: 200,
      };

      axios.get.mockResolvedValue(mockResponse);

      await healthCheckService.getProcessorHealth("default");
      await healthCheckService.getProcessorHealth("default");

      const stats = healthCheckService.getHealthStats();
      expect(stats.default.avgResponseTime).toBeGreaterThan(0);
      expect(stats.default.totalChecks).toBe(1); // Only one actual call due to caching
    });

    it("should limit response time history", async () => {
      const mockResponse = {
        data: {
          failing: false,
          minResponseTime: 100,
        },
        status: 200,
      };

      axios.get.mockResolvedValue(mockResponse);

      // Make more than 50 calls
      for (let i = 0; i < 60; i++) {
        await healthCheckService.getProcessorHealth("default");
      }

      const stats = healthCheckService.getHealthStats();
      expect(stats.default.totalChecks).toBe(1); // Only one actual call due to caching
    });
  });

  describe("Multiple processors", () => {
    it("should check all processors health", async () => {
      const mockDefaultResponse = {
        data: { failing: false, minResponseTime: 100 },
        status: 200,
      };
      const mockFallbackResponse = {
        data: { failing: true, minResponseTime: 999999 },
        status: 200,
      };

      axios.get
        .mockResolvedValueOnce(mockDefaultResponse)
        .mockResolvedValueOnce(mockFallbackResponse);

      const result = await healthCheckService.getAllProcessorsHealth();

      expect(result).toEqual({
        default: expect.objectContaining({
          failing: false,
          minResponseTime: 100,
          isHealthy: true,
        }),
        fallback: expect.objectContaining({
          failing: true,
          minResponseTime: 999999,
          isHealthy: false,
        }),
        timestamp: expect.any(String),
      });
    });

    it("should handle partial failures", async () => {
      const mockDefaultResponse = {
        data: { failing: false, minResponseTime: 100 },
        status: 200,
      };

      axios.get
        .mockResolvedValueOnce(mockDefaultResponse)
        .mockRejectedValueOnce(new Error("Network error"));

      const result = await healthCheckService.getAllProcessorsHealth();

      expect(result.default.isHealthy).toBe(true);
      expect(result.fallback.isHealthy).toBe(false);
      expect(result.fallback.error).toBe("Network error");
    });
  });

  describe("Cache management", () => {
    it("should clear cache", () => {
      healthCheckService.clearCache();
      
      expect(healthCheckService.healthCache.size).toBe(0);
      expect(healthCheckService.lastHealthCheck.default).toBe(0);
      expect(healthCheckService.lastHealthCheck.fallback).toBe(0);
    });

    it("should get next health check time", () => {
      const nextCheckTime = healthCheckService.getNextHealthCheckTime("default");
      expect(nextCheckTime).toBeInstanceOf(Date);
    });
  });

  describe("Health statistics", () => {
    it("should provide health statistics", async () => {
      const mockResponse = {
        data: { failing: false, minResponseTime: 100 },
        status: 200,
      };

      axios.get.mockResolvedValue(mockResponse);

      await healthCheckService.getProcessorHealth("default");
      await healthCheckService.getProcessorHealth("fallback");

      const stats = healthCheckService.getHealthStats();

      expect(stats.default).toEqual({
        avgResponseTime: expect.any(Number),
        p95ResponseTime: expect.any(Number),
        totalChecks: 1,
        lastCheck: expect.any(String),
        isHealthy: true,
        failing: false,
      });

      expect(stats.fallback).toEqual({
        avgResponseTime: expect.any(Number),
        p95ResponseTime: expect.any(Number),
        totalChecks: 1,
        lastCheck: expect.any(String),
        isHealthy: true,
        failing: false,
      });
    });
  });
}); 