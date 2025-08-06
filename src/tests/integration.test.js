const request = require("supertest");
const app = require("../app");

describe("Integration Tests", () => {
  describe("Payment Processing", () => {
    it("should process payment successfully", async () => {
      const paymentData = {
        correlationId: "550e8400-e29b-41d4-a716-446655440000",
        amount: 100.5,
      };

      const response = await request(app)
        .post("/payments")
        .send(paymentData)
        .expect(200);

      expect(response.body).toHaveProperty("message");
      expect(response.body).toHaveProperty("correlationId");
      expect(response.body).toHaveProperty("amount");
      expect(response.body).toHaveProperty("processor");
      expect(response.body.correlationId).toBe(paymentData.correlationId);
      expect(response.body.amount).toBe(paymentData.amount);
    });

    it("should reject invalid payment data", async () => {
      const invalidPaymentData = {
        correlationId: "invalid-uuid",
        amount: -100.5,
      };

      const response = await request(app)
        .post("/payments")
        .send(invalidPaymentData)
        .expect(400);

      expect(response.body).toHaveProperty("error");
      expect(response.body).toHaveProperty("details");
    });

    it("should reject missing required fields", async () => {
      const incompletePaymentData = {
        correlationId: "550e8400-e29b-41d4-a716-446655440000",
        // Missing amount
      };

      const response = await request(app)
        .post("/payments")
        .send(incompletePaymentData)
        .expect(400);

      expect(response.body).toHaveProperty("error");
      expect(response.body).toHaveProperty("details");
    });
  });

  describe("Payment Summary", () => {
    it("should return payment summary", async () => {
      const response = await request(app).get("/payments/summary").expect(200);

      expect(response.body).toHaveProperty("default");
      expect(response.body).toHaveProperty("fallback");
      expect(response.body.default).toHaveProperty("totalRequests");
      expect(response.body.default).toHaveProperty("totalAmount");
      expect(response.body.fallback).toHaveProperty("totalRequests");
      expect(response.body.fallback).toHaveProperty("totalAmount");
    });

    it("should return payment summary with date range", async () => {
      const response = await request(app)
        .get(
          "/payments/summary?from=2025-08-01T00:00:00Z&to=2025-08-03T23:59:59Z"
        )
        .expect(200);

      expect(response.body).toHaveProperty("default");
      expect(response.body).toHaveProperty("fallback");
    });
  });

  describe("Health Checks", () => {
    it("should return application health", async () => {
      const response = await request(app).get("/health").expect(200);

      expect(response.body).toHaveProperty("status", "healthy");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("service");
      expect(response.body).toHaveProperty("version");
    });

    it("should return payment processors health", async () => {
      const response = await request(app)
        .get("/health/payment-processors")
        .expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("processors");
      expect(response.body.processors).toHaveProperty("default");
      expect(response.body.processors).toHaveProperty("fallback");
    });

    it("should return service statistics", async () => {
      const response = await request(app).get("/health/stats").expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("service");
      expect(response.body).toHaveProperty("version");
      expect(response.body).toHaveProperty("stats");
      expect(response.body.stats).toHaveProperty("circuitBreakers");
      expect(response.body.stats).toHaveProperty("retryService");
      expect(response.body.stats).toHaveProperty("healthCheck");
      expect(response.body.stats).toHaveProperty("audit");
      expect(response.body.stats).toHaveProperty("consistency");
    });
  });

  describe("Audit Logs", () => {
    it("should return audit logs for correlation ID", async () => {
      const correlationId = "550e8400-e29b-41d4-a716-446655440000";

      const response = await request(app)
        .get(`/health/audit/${correlationId}`)
        .expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("correlationId");
      expect(response.body).toHaveProperty("auditLogs");
      expect(response.body).toHaveProperty("totalLogs");
    });

    it("should return all audit logs", async () => {
      const response = await request(app).get("/health/audit").expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("auditLogs");
      expect(response.body).toHaveProperty("totalLogs");
    });
  });

  describe("Error Handling", () => {
    it("should handle 404 for non-existent endpoints", async () => {
      const response = await request(app).get("/nonexistent").expect(404);

      expect(response.body).toHaveProperty("error");
      expect(response.body).toHaveProperty("path");
    });

    it("should handle malformed JSON", async () => {
      const response = await request(app)
        .post("/payments")
        .set("Content-Type", "application/json")
        .send("invalid json")
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Rate Limiting", () => {
    it("should handle multiple rapid requests", async () => {
      const paymentData = {
        correlationId: "550e8400-e29b-41d4-a716-446655440001",
        amount: 50.0,
      };

      // Make multiple requests rapidly
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app)
            .post("/payments")
            .send({
              ...paymentData,
              correlationId: `550e8400-e29b-41d4-a716-44665544000${i}`,
            })
        );
      }

      const responses = await Promise.all(promises);

      // All should succeed (rate limiting is handled by nginx in production)
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe("Circuit Breaker Integration", () => {
    it("should reset circuit breakers", async () => {
      const response = await request(app)
        .post("/health/reset-circuit-breakers")
        .expect(200);

      expect(response.body).toHaveProperty("message");
      expect(response.body).toHaveProperty("timestamp");
    });

    it("should clear health check cache", async () => {
      const response = await request(app)
        .post("/health/clear-health-cache")
        .expect(200);

      expect(response.body).toHaveProperty("message");
      expect(response.body).toHaveProperty("timestamp");
    });

    it("should clear audit logs", async () => {
      const response = await request(app)
        .post("/health/clear-audit-logs")
        .expect(200);

      expect(response.body).toHaveProperty("message");
      expect(response.body).toHaveProperty("timestamp");
    });
  });
});
