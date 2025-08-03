const { Pool } = require("pg");
const { logger } = require("../utils/logger");

class DatabaseService {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || "postgres",
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || "rinha_backend",
      user: process.env.DB_USER || "rinha_user",
      password: process.env.DB_PASSWORD || "rinha_password",
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    this.pool.on("error", (err) => {
      logger.error("Unexpected error on idle client", err);
    });
  }

  // Test database connection
  async testConnection() {
    try {
      const client = await this.pool.connect();
      await client.query("SELECT NOW()");
      client.release();
      logger.info("Database connection successful");
      return true;
    } catch (error) {
      logger.error("Database connection failed", { error: error.message });
      return false;
    }
  }

  // Store payment record
  async storePayment(correlationId, amount, processorType, requestedAt) {
    const query = `
      INSERT INTO payments (correlation_id, amount, processor_type, requested_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (correlation_id) DO NOTHING
      RETURNING id
    `;

    try {
      const result = await this.pool.query(query, [
        correlationId,
        amount,
        processorType,
        requestedAt,
      ]);

      logger.info("Payment stored in database", {
        correlationId,
        amount,
        processorType,
        id: result.rows[0]?.id,
      });

      return result.rows[0]?.id;
    } catch (error) {
      logger.error("Failed to store payment", {
        correlationId,
        error: error.message,
      });
      throw error;
    }
  }

  // Get payment summary
  async getPaymentSummary(from, to) {
    const query = `
      SELECT 
        processor_type,
        COUNT(*) as total_requests,
        COALESCE(SUM(amount), 0) as total_amount
      FROM payments 
      WHERE status = 'processed'
        AND ($1::timestamp IS NULL OR requested_at >= $1)
        AND ($2::timestamp IS NULL OR requested_at <= $2)
      GROUP BY processor_type
    `;

    try {
      const result = await this.pool.query(query, [from, to]);

      // Initialize default structure
      const summary = {
        default: { totalRequests: 0, totalAmount: 0 },
        fallback: { totalRequests: 0, totalAmount: 0 },
      };

      // Fill with actual data
      result.rows.forEach((row) => {
        const processor = row.processor_type;
        summary[processor] = {
          totalRequests: parseInt(row.total_requests),
          totalAmount: parseFloat(row.total_amount),
        };
      });

      logger.info("Payment summary retrieved", {
        defaultRequests: summary.default.totalRequests,
        defaultAmount: summary.default.totalAmount,
        fallbackRequests: summary.fallback.totalRequests,
        fallbackAmount: summary.fallback.totalAmount,
      });

      return summary;
    } catch (error) {
      logger.error("Failed to get payment summary", {
        error: error.message,
        from,
        to,
      });
      throw error;
    }
  }

  // Get payment by correlation ID
  async getPaymentByCorrelationId(correlationId) {
    const query = `
      SELECT * FROM payments 
      WHERE correlation_id = $1
    `;

    try {
      const result = await this.pool.query(query, [correlationId]);
      return result.rows[0];
    } catch (error) {
      logger.error("Failed to get payment by correlation ID", {
        correlationId,
        error: error.message,
      });
      throw error;
    }
  }

  // Close database connection
  async close() {
    await this.pool.end();
    logger.info("Database connection closed");
  }
}

module.exports = { DatabaseService };
