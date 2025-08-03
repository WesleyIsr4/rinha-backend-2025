const { logger } = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error("Error occurred:", {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });

  // Default error
  let status = 500;
  let message = "Internal Server Error";

  // Handle specific error types
  if (err.name === "ValidationError") {
    status = 400;
    message = err.message;
  } else if (err.name === "UnauthorizedError") {
    status = 401;
    message = "Unauthorized";
  } else if (err.name === "NotFoundError") {
    status = 404;
    message = err.message;
  } else if (err.code === "ECONNREFUSED") {
    status = 503;
    message = "Service temporarily unavailable";
  }

  // Send error response
  res.status(status).json({
    error: message,
    timestamp: new Date().toISOString(),
    path: req.url,
  });
};

module.exports = { errorHandler };
