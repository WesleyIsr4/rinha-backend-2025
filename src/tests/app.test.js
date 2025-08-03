const request = require("supertest");
const app = require("../app");

describe("App", () => {
  describe("GET /", () => {
    it("should return application info", async () => {
      const response = await request(app).get("/").expect(200);

      expect(response.body).toHaveProperty("message");
      expect(response.body).toHaveProperty("version");
      expect(response.body).toHaveProperty("endpoints");
      expect(response.body.endpoints).toHaveProperty("payments");
      expect(response.body.endpoints).toHaveProperty("health");
    });
  });

  describe("GET /health", () => {
    it("should return health status", async () => {
      const response = await request(app).get("/health").expect(200);

      expect(response.body).toHaveProperty("status", "healthy");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("service");
    });
  });

  describe("GET /nonexistent", () => {
    it("should return 404 for non-existent endpoints", async () => {
      const response = await request(app).get("/nonexistent").expect(404);

      expect(response.body).toHaveProperty("error");
      expect(response.body).toHaveProperty("path");
    });
  });
});
