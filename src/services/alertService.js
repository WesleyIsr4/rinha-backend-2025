const { logger, logHelpers } = require("../utils/logger");

class AlertService {
  constructor() {
    this.alerts = [];
    this.alertHistory = [];
    this.config = {
      // Alert thresholds
      thresholds: {
        p99Latency: 1000, // 1 second
        successRate: 99, // 99%
        errorRate: 5, // 5%
        memoryUsage: 80, // 80%
        circuitBreakerFailures: 3, // 3 consecutive failures
        cacheHitRate: 70, // 70%
      },

      // Alert cooldown (prevent spam)
      cooldown: {
        performance: 300000, // 5 minutes
        reliability: 600000, // 10 minutes
        system: 900000, // 15 minutes
      },

      // Alert retention
      maxAlerts: 1000,
      maxHistory: 10000,
    };

    this.lastAlerts = {};

    logger.info("Alert Service initialized");
  }

  // Check and create alerts
  checkAlerts(metrics) {
    const newAlerts = [];

    // Performance alerts
    if (
      metrics.performance &&
      metrics.performance.p99 > this.config.thresholds.p99Latency
    ) {
      const alert = this.createAlert(
        "performance",
        "warning",
        "P99 latency exceeds threshold",
        {
          p99: metrics.performance.p99,
          threshold: this.config.thresholds.p99Latency,
        }
      );

      if (alert) newAlerts.push(alert);
    }

    // Success rate alerts
    if (
      metrics.calculated &&
      metrics.calculated.successRate < this.config.thresholds.successRate
    ) {
      const alert = this.createAlert(
        "reliability",
        "critical",
        "Success rate below threshold",
        {
          successRate: metrics.calculated.successRate,
          threshold: this.config.thresholds.successRate,
        }
      );

      if (alert) newAlerts.push(alert);
    }

    // Error rate alerts
    if (metrics.errors && metrics.errors.total > 0) {
      const errorRate =
        (metrics.errors.total / Math.max(metrics.requests.total, 1)) * 100;
      if (errorRate > this.config.thresholds.errorRate) {
        const alert = this.createAlert(
          "reliability",
          "critical",
          "Error rate above threshold",
          {
            errorRate,
            threshold: this.config.thresholds.errorRate,
            totalErrors: metrics.errors.total,
            totalRequests: metrics.requests.total,
          }
        );

        if (alert) newAlerts.push(alert);
      }
    }

    // Memory usage alerts
    if (
      metrics.system &&
      metrics.system.memory &&
      metrics.system.memory.percentage > this.config.thresholds.memoryUsage
    ) {
      const alert = this.createAlert(
        "system",
        "warning",
        "Memory usage above threshold",
        {
          memoryUsage: metrics.system.memory.percentage,
          threshold: this.config.thresholds.memoryUsage,
          used: metrics.system.memory.used,
          total: metrics.system.memory.total,
        }
      );

      if (alert) newAlerts.push(alert);
    }

    // Circuit breaker alerts
    if (metrics.business && metrics.business.circuitBreakers) {
      Object.entries(metrics.business.circuitBreakers).forEach(
        ([processor, cb]) => {
          if (cb.state === "OPEN") {
            const alert = this.createAlert(
              "reliability",
              "critical",
              `Circuit breaker OPEN for ${processor}`,
              {
                processor,
                state: cb.state,
                failures: cb.failures,
                successes: cb.successes,
              }
            );

            if (alert) newAlerts.push(alert);
          }
        }
      );
    }

    // Cache hit rate alerts
    if (
      metrics.business &&
      metrics.business.cache &&
      metrics.business.cache.hitRate < this.config.thresholds.cacheHitRate
    ) {
      const alert = this.createAlert(
        "performance",
        "warning",
        "Cache hit rate below threshold",
        {
          hitRate: metrics.business.cache.hitRate,
          threshold: this.config.thresholds.cacheHitRate,
          hits: metrics.business.cache.hits,
          misses: metrics.business.cache.misses,
        }
      );

      if (alert) newAlerts.push(alert);
    }

    // Process new alerts
    newAlerts.forEach((alert) => this.processAlert(alert));

    return newAlerts;
  }

  // Create alert if not in cooldown
  createAlert(type, severity, message, data = {}) {
    const alertKey = `${type}:${severity}:${message}`;
    const now = Date.now();
    const cooldown = this.config.cooldown[type] || 300000; // Default 5 minutes

    // Check if alert is in cooldown
    if (
      this.lastAlerts[alertKey] &&
      now - this.lastAlerts[alertKey] < cooldown
    ) {
      return null;
    }

    const alert = {
      id: this.generateAlertId(),
      type,
      severity,
      message,
      data,
      timestamp: new Date().toISOString(),
      acknowledged: false,
      resolved: false,
    };

    // Update last alert time
    this.lastAlerts[alertKey] = now;

    return alert;
  }

  // Process alert
  processAlert(alert) {
    // Add to current alerts
    this.alerts.push(alert);

    // Add to history
    this.alertHistory.push(alert);

    // Limit alerts and history
    if (this.alerts.length > this.config.maxAlerts) {
      this.alerts.shift();
    }

    if (this.alertHistory.length > this.config.maxHistory) {
      this.alertHistory.shift();
    }

    // Log alert
    logHelpers.logError(
      `ALERT: ${alert.severity.toUpperCase()} - ${alert.message}`,
      new Error(alert.message),
      {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
        data: alert.data,
      }
    );

    // Send notification (in production, this could be email, Slack, etc.)
    this.sendNotification(alert);

    logger.warn("Alert created", {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
    });
  }

  // Send notification (placeholder for production implementation)
  sendNotification(alert) {
    // In production, this could integrate with:
    // - Email service (SendGrid, AWS SES)
    // - Slack webhooks
    // - PagerDuty
    // - SMS service

    const notification = {
      to: process.env.ALERT_EMAIL || "admin@example.com",
      subject: `[${alert.severity.toUpperCase()}] ${alert.message}`,
      body: `
Alert ID: ${alert.id}
Type: ${alert.type}
Severity: ${alert.severity}
Message: ${alert.message}
Timestamp: ${alert.timestamp}
Data: ${JSON.stringify(alert.data, null, 2)}
      `,
    };

    // For now, just log the notification
    logger.info("Alert notification would be sent", {
      alertId: alert.id,
      notification,
    });

    // TODO: Implement actual notification sending
    // this.sendEmail(notification);
    // this.sendSlackMessage(notification);
  }

  // Acknowledge alert
  acknowledgeAlert(alertId) {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date().toISOString();

      logger.info("Alert acknowledged", {
        alertId,
        acknowledgedAt: alert.acknowledgedAt,
      });
    }
  }

  // Resolve alert
  resolveAlert(alertId) {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();

      // Remove from active alerts
      this.alerts = this.alerts.filter((a) => a.id !== alertId);

      logger.info("Alert resolved", {
        alertId,
        resolvedAt: alert.resolvedAt,
      });
    }
  }

  // Get active alerts
  getActiveAlerts() {
    return this.alerts.filter((alert) => !alert.resolved);
  }

  // Get alerts by severity
  getAlertsBySeverity(severity) {
    return this.alerts.filter((alert) => alert.severity === severity);
  }

  // Get alerts by type
  getAlertsByType(type) {
    return this.alerts.filter((alert) => alert.type === type);
  }

  // Get alert statistics
  getAlertStats() {
    const stats = {
      total: this.alerts.length,
      bySeverity: {
        critical: this.getAlertsBySeverity("critical").length,
        warning: this.getAlertsBySeverity("warning").length,
        info: this.getAlertsBySeverity("info").length,
      },
      byType: {
        performance: this.getAlertsByType("performance").length,
        reliability: this.getAlertsByType("reliability").length,
        system: this.getAlertsByType("system").length,
      },
      acknowledged: this.alerts.filter((a) => a.acknowledged).length,
      resolved: this.alerts.filter((a) => a.resolved).length,
      history: this.alertHistory.length,
    };

    return stats;
  }

  // Clear old alerts
  clearOldAlerts(maxAge = 24 * 60 * 60 * 1000) {
    // 24 hours
    const cutoff = Date.now() - maxAge;

    this.alerts = this.alerts.filter(
      (alert) => new Date(alert.timestamp).getTime() > cutoff
    );

    this.alertHistory = this.alertHistory.filter(
      (alert) => new Date(alert.timestamp).getTime() > cutoff
    );

    logger.info("Old alerts cleared", {
      cutoff: new Date(cutoff).toISOString(),
      remainingAlerts: this.alerts.length,
      remainingHistory: this.alertHistory.length,
    });
  }

  // Generate unique alert ID
  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Update alert thresholds
  updateThresholds(newThresholds) {
    this.config.thresholds = {
      ...this.config.thresholds,
      ...newThresholds,
    };

    logger.info("Alert thresholds updated", {
      newThresholds,
    });
  }

  // Get alert configuration
  getConfig() {
    return {
      thresholds: this.config.thresholds,
      cooldown: this.config.cooldown,
      maxAlerts: this.config.maxAlerts,
      maxHistory: this.config.maxHistory,
    };
  }
}

module.exports = { AlertService };
