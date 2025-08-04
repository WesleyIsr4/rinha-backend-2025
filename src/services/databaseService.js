const { Pool } = require("pg");
const redis = require("redis");
const { logger } = require("../utils/logger");

class DatabaseService {
  constructor() {
    // Optimized connection pool configuration
    this.pool = new Pool({
      host: process.env.DB_HOST || "postgres",
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || "rinha_backend",
      user: process.env.DB_USER || "rinha_user",
      password: process.env.DB_PASSWORD || "rinha_password",

      // Connection pool optimization
      max: 25, // Increased from 20 for better concurrency
      min: 5, // Minimum connections to keep alive
      idleTimeoutMillis: 30000, // 30 seconds
      connectionTimeoutMillis: 2000, // 2 seconds

      // Performance optimizations
      statement_timeout: 30000, // 30 seconds query timeout
      query_timeout: 30000, // 30 seconds query timeout

      // Connection optimization
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000, // 10 seconds

      // SSL configuration (if needed)
      ssl:
        process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    });

    // Handle pool errors
    this.pool.on("error", (err) => {
      logger.error("Unexpected error on idle client", err);
    });

    // Pool event listeners for monitoring
    this.pool.on("connect", (client) => {
      logger.debug("New client connected to database pool");
    });

    this.pool.on("acquire", (client) => {
      logger.debug("Client acquired from database pool");
    });

    this.pool.on("release", (client) => {
      logger.debug("Client released to database pool");
    });

    // Initialize Redis connection
    this.initializeRedis();
  }

  async initializeRedis() {
    try {
      this.redisClient = redis.createClient({
        url: process.env.REDIS_URL || "redis://redis:6379",
        socket: {
          connectTimeout: 5000,
          lazyConnect: true,
          keepAlive: 5000, // Keep alive for better performance
        },
        retry_strategy: (options) => {
          if (options.error && options.error.code === "ECONNREFUSED") {
            logger.error("Redis server refused connection");
            return new Error("Redis server refused connection");
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error("Redis retry time exhausted");
            return new Error("Retry time exhausted");
          }
          if (options.attempt > 10) {
            logger.error("Redis max retry attempts reached");
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        },
      });

      this.redisClient.on("error", (err) => {
        logger.error("Redis client error", { error: err.message });
      });

      this.redisClient.on("connect", () => {
        logger.info("Redis client connected");
      });

      this.redisClient.on("ready", () => {
        logger.info("Redis client ready");
      });

      await this.redisClient.connect();
    } catch (error) {
      logger.warn("Failed to initialize Redis client", {
        error: error.message,
      });
      this.redisClient = null;
    }
  }

  // Get Redis client instance
  static async getRedisClient() {
    if (!this.instance) {
      this.instance = new DatabaseService();
    }

    if (!this.instance.redisClient) {
      await this.instance.initializeRedis();
    }

    return this.instance.redisClient;
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

  // Test Redis connection
  async testRedisConnection() {
    try {
      if (!this.redisClient) {
        return false;
      }
      await this.redisClient.ping();
      logger.info("Redis connection successful");
      return true;
    } catch (error) {
      logger.error("Redis connection failed", { error: error.message });
      return false;
    }
  }

  // Get pool statistics
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  // Store payment record with optimized query
  async storePayment(correlationId, amount, processorType, requestedAt) {
    const query = `
      INSERT INTO payments (correlation_id, amount, processor_type, requested_at, status, processed_at)
      VALUES ($1, $2, $3, $4, 'processed', NOW())
      ON CONFLICT (correlation_id) DO NOTHING
      RETURNING id, correlation_id, amount, processor_type, status, processed_at
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
        status: result.rows[0]?.status,
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

  // Get payment summary with optimized query
  async getPaymentSummary(from, to) {
    const query = `
      SELECT 
        processor_type,
        COUNT(*) as total_requests,
        COALESCE(SUM(amount), 0) as total_amount,
        AVG(amount) as avg_amount,
        MIN(amount) as min_amount,
        MAX(amount) as max_amount
      FROM payments 
      WHERE status = 'processed'
        AND ($1::timestamp IS NULL OR requested_at >= $1)
        AND ($2::timestamp IS NULL OR requested_at <= $2)
      GROUP BY processor_type
      ORDER BY processor_type
    `;

    try {
      const result = await this.pool.query(query, [from, to]);

      // Initialize default structure
      const summary = {
        default: {
          totalRequests: 0,
          totalAmount: 0,
          avgAmount: 0,
          minAmount: 0,
          maxAmount: 0,
        },
        fallback: {
          totalRequests: 0,
          totalAmount: 0,
          avgAmount: 0,
          minAmount: 0,
          maxAmount: 0,
        },
      };

      // Fill with actual data
      result.rows.forEach((row) => {
        const processor = row.processor_type;
        summary[processor] = {
          totalRequests: parseInt(row.total_requests),
          totalAmount: parseFloat(row.total_amount),
          avgAmount: parseFloat(row.avg_amount) || 0,
          minAmount: parseFloat(row.min_amount) || 0,
          maxAmount: parseFloat(row.max_amount) || 0,
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

  // Get payment by correlation ID with optimized query
  async getPaymentByCorrelationId(correlationId) {
    const query = `
      SELECT 
        id,
        correlation_id,
        amount,
        processor_type,
        requested_at,
        processed_at,
        status,
        error_message,
        created_at
      FROM payments 
      WHERE correlation_id = $1
      LIMIT 1
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

  // Get payment statistics for monitoring
  async getPaymentStats() {
    const query = `
      SELECT 
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_payments,
        COALESCE(SUM(amount), 0) as total_amount,
        AVG(amount) as avg_amount,
        MIN(requested_at) as first_payment,
        MAX(requested_at) as last_payment
      FROM payments
    `;

    try {
      const result = await this.pool.query(query);
      const stats = result.rows[0];

      return {
        totalPayments: parseInt(stats.total_payments),
        successfulPayments: parseInt(stats.successful_payments),
        failedPayments: parseInt(stats.failed_payments),
        totalAmount: parseFloat(stats.total_amount),
        avgAmount: parseFloat(stats.avg_amount),
        firstPayment: stats.first_payment,
        lastPayment: stats.last_payment,
        successRate:
          stats.total_payments > 0
            ? (
                (stats.successful_payments / stats.total_payments) *
                100
              ).toFixed(2)
            : 0,
      };
    } catch (error) {
      logger.error("Failed to get payment stats", { error: error.message });
      throw error;
    }
  }

  // Cache operations with optimized TTL
  async setCache(key, value, ttl = 3600) {
    try {
      if (!this.redisClient) {
        return false;
      }
      await this.redisClient.set(key, JSON.stringify(value), "EX", ttl);
      return true;
    } catch (error) {
      logger.warn("Failed to set cache", { key, error: error.message });
      return false;
    }
  }

  async getCache(key) {
    try {
      if (!this.redisClient) {
        return null;
      }
      const value = await this.redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.warn("Failed to get cache", { key, error: error.message });
      return null;
    }
  }

  async deleteCache(key) {
    try {
      if (!this.redisClient) {
        return false;
      }
      await this.redisClient.del(key);
      return true;
    } catch (error) {
      logger.warn("Failed to delete cache", { key, error: error.message });
      return false;
    }
  }

  async clearAllCache() {
    try {
      if (!this.redisClient) {
        return false;
      }
      await this.redisClient.flushdb();
      logger.info("All cache cleared");
      return true;
    } catch (error) {
      logger.error("Failed to clear all cache", { error: error.message });
      return false;
    }
  }

  // Close database connection
  async close() {
    await this.pool.end();
    if (this.redisClient) {
      await this.redisClient.quit();
    }
    logger.info("Database and Redis connections closed");
  }
}

module.exports = { DatabaseService };
