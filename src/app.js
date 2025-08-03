const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const { logger } = require("./utils/logger");
const { errorHandler } = require("./middleware/errorHandler");
const { requestLogger } = require("./middleware/requestLogger");

// Import routes
const paymentsRoutes = require("./routes/payments");
const healthRoutes = require("./routes/health");

const app = express();
const PORT = process.env.PORT || 9999;

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// Routes
app.use("/payments", paymentsRoutes);
app.use("/health", healthRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Rinha Backend 2025 - Payment Processor",
    version: "1.0.0",
    endpoints: {
      payments: "/payments",
      health: "/health",
    },
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.originalUrl,
  });
});

// Error handler
app.use(errorHandler);

// Start server only if not in test environment
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

module.exports = app;
