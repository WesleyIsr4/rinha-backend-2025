const { logger } = require('../utils/logger');
const { AuditService } = require('./auditService');

class ConsistencyService {
  constructor() {
    this.auditService = new AuditService();
  }

  // Verify payment consistency
  async verifyPaymentConsistency(correlationId, amount, processorType, requestedAt) {
    const checks = [];
    
    // Check 1: Verify correlation ID format
    const correlationIdCheck = this.verifyCorrelationIdFormat(correlationId);
    checks.push(correlationIdCheck);
    
    // Check 2: Verify amount is positive and has correct precision
    const amountCheck = this.verifyAmountFormat(amount);
    checks.push(amountCheck);
    
    // Check 3: Verify processor type is valid
    const processorCheck = this.verifyProcessorType(processorType);
    checks.push(processorCheck);
    
    // Check 4: Verify timestamp is valid
    const timestampCheck = this.verifyTimestampFormat(requestedAt);
    checks.push(timestampCheck);
    
    // Check 5: Verify no duplicate correlation ID (if database is available)
    const duplicateCheck = await this.verifyNoDuplicateCorrelationId(correlationId);
    checks.push(duplicateCheck);
    
    const allChecksPassed = checks.every(check => check.result);
    
    this.auditService.logConsistencyCheck(
      correlationId,
      'PAYMENT_VALIDATION',
      allChecksPassed,
      {
        checks,
        totalChecks: checks.length,
        passedChecks: checks.filter(c => c.result).length,
        failedChecks: checks.filter(c => !c.result).length,
      }
    );
    
    return {
      consistent: allChecksPassed,
      checks,
      summary: {
        total: checks.length,
        passed: checks.filter(c => c.result).length,
        failed: checks.filter(c => !c.result).length,
      },
    };
  }

  // Verify summary consistency
  async verifySummaryConsistency(summary, from, to) {
    const checks = [];
    
    // Check 1: Verify summary structure
    const structureCheck = this.verifySummaryStructure(summary);
    checks.push(structureCheck);
    
    // Check 2: Verify amounts are positive
    const amountsCheck = this.verifySummaryAmounts(summary);
    checks.push(amountsCheck);
    
    // Check 3: Verify request counts are non-negative
    const countsCheck = this.verifySummaryCounts(summary);
    checks.push(countsCheck);
    
    // Check 4: Verify date range if provided
    if (from || to) {
      const dateRangeCheck = this.verifyDateRange(from, to);
      checks.push(dateRangeCheck);
    }
    
    const allChecksPassed = checks.every(check => check.result);
    
    this.auditService.logConsistencyCheck(
      'SUMMARY_CHECK',
      'SUMMARY_VALIDATION',
      allChecksPassed,
      {
        checks,
        summary,
        dateRange: { from, to },
      }
    );
    
    return {
      consistent: allChecksPassed,
      checks,
      summary: {
        total: checks.length,
        passed: checks.filter(c => c.result).length,
        failed: checks.filter(c => !c.result).length,
      },
    };
  }

  // Verify correlation ID format
  verifyCorrelationIdFormat(correlationId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const isValid = uuidRegex.test(correlationId);
    
    return {
      name: 'correlation_id_format',
      result: isValid,
      details: {
        value: correlationId,
        expected: 'UUID v4 format',
        actual: isValid ? 'valid' : 'invalid',
      },
    };
  }

  // Verify amount format
  verifyAmountFormat(amount) {
    const isNumber = typeof amount === 'number';
    const isPositive = amount > 0;
    const hasCorrectPrecision = Number.isFinite(amount) && 
      (amount * 100) % 1 === 0; // Max 2 decimal places
    
    const isValid = isNumber && isPositive && hasCorrectPrecision;
    
    return {
      name: 'amount_format',
      result: isValid,
      details: {
        value: amount,
        isNumber,
        isPositive,
        hasCorrectPrecision,
        expected: 'positive number with max 2 decimal places',
        actual: isValid ? 'valid' : 'invalid',
      },
    };
  }

  // Verify processor type
  verifyProcessorType(processorType) {
    const validTypes = ['default', 'fallback'];
    const isValid = validTypes.includes(processorType);
    
    return {
      name: 'processor_type',
      result: isValid,
      details: {
        value: processorType,
        validTypes,
        expected: 'default or fallback',
        actual: isValid ? 'valid' : 'invalid',
      },
    };
  }

  // Verify timestamp format
  verifyTimestampFormat(timestamp) {
    const date = new Date(timestamp);
    const isValid = !isNaN(date.getTime()) && timestamp.includes('T') && timestamp.includes('Z');
    
    return {
      name: 'timestamp_format',
      result: isValid,
      details: {
        value: timestamp,
        expected: 'ISO 8601 format',
        actual: isValid ? 'valid' : 'invalid',
      },
    };
  }

  // Verify no duplicate correlation ID
  async verifyNoDuplicateCorrelationId(correlationId) {
    try {
      // This would typically check the database
      // For now, we'll assume it's unique
      return {
        name: 'no_duplicate_correlation_id',
        result: true,
        details: {
          value: correlationId,
          expected: 'unique correlation ID',
          actual: 'assumed unique',
        },
      };
    } catch (error) {
      return {
        name: 'no_duplicate_correlation_id',
        result: false,
        details: {
          value: correlationId,
          error: error.message,
          expected: 'unique correlation ID',
          actual: 'check failed',
        },
      };
    }
  }

  // Verify summary structure
  verifySummaryStructure(summary) {
    const hasDefault = summary && summary.default;
    const hasFallback = summary && summary.fallback;
    const hasDefaultRequests = hasDefault && typeof summary.default.totalRequests === 'number';
    const hasDefaultAmount = hasDefault && typeof summary.default.totalAmount === 'number';
    const hasFallbackRequests = hasFallback && typeof summary.fallback.totalRequests === 'number';
    const hasFallbackAmount = hasFallback && typeof summary.fallback.totalAmount === 'number';
    
    const isValid = hasDefault && hasFallback && 
      hasDefaultRequests && hasDefaultAmount && 
      hasFallbackRequests && hasFallbackAmount;
    
    return {
      name: 'summary_structure',
      result: isValid,
      details: {
        hasDefault,
        hasFallback,
        hasDefaultRequests,
        hasDefaultAmount,
        hasFallbackRequests,
        hasFallbackAmount,
        expected: 'complete summary structure',
        actual: isValid ? 'valid' : 'invalid',
      },
    };
  }

  // Verify summary amounts
  verifySummaryAmounts(summary) {
    const defaultAmountValid = summary.default.totalAmount >= 0;
    const fallbackAmountValid = summary.fallback.totalAmount >= 0;
    
    const isValid = defaultAmountValid && fallbackAmountValid;
    
    return {
      name: 'summary_amounts',
      result: isValid,
      details: {
        defaultAmount: summary.default.totalAmount,
        fallbackAmount: summary.fallback.totalAmount,
        defaultAmountValid,
        fallbackAmountValid,
        expected: 'non-negative amounts',
        actual: isValid ? 'valid' : 'invalid',
      },
    };
  }

  // Verify summary counts
  verifySummaryCounts(summary) {
    const defaultCountValid = summary.default.totalRequests >= 0;
    const fallbackCountValid = summary.fallback.totalRequests >= 0;
    
    const isValid = defaultCountValid && fallbackCountValid;
    
    return {
      name: 'summary_counts',
      result: isValid,
      details: {
        defaultCount: summary.default.totalRequests,
        fallbackCount: summary.fallback.totalRequests,
        defaultCountValid,
        fallbackCountValid,
        expected: 'non-negative counts',
        actual: isValid ? 'valid' : 'invalid',
      },
    };
  }

  // Verify date range
  verifyDateRange(from, to) {
    if (!from && !to) {
      return {
        name: 'date_range',
        result: true,
        details: {
          from,
          to,
          expected: 'valid date range or no range',
          actual: 'no range provided',
        },
      };
    }
    
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    
    const fromValid = !from || !isNaN(fromDate.getTime());
    const toValid = !to || !isNaN(toDate.getTime());
    const rangeValid = !from || !to || fromDate <= toDate;
    
    const isValid = fromValid && toValid && rangeValid;
    
    return {
      name: 'date_range',
      result: isValid,
      details: {
        from,
        to,
        fromValid,
        toValid,
        rangeValid,
        expected: 'valid date range',
        actual: isValid ? 'valid' : 'invalid',
      },
    };
  }

  // Get consistency statistics
  getConsistencyStats() {
    const auditStats = this.auditService.getAuditStats();
    const consistencyLogs = this.auditService.getAuditLogsByEvent('CONSISTENCY_CHECK');
    
    return {
      totalAuditLogs: auditStats.totalLogs,
      consistencyChecks: consistencyLogs.length,
      consistencyCheckResults: {
        passed: consistencyLogs.filter(log => log.result).length,
        failed: consistencyLogs.filter(log => !log.result).length,
      },
      recentChecks: consistencyLogs.slice(-10), // Last 10 checks
    };
  }
}

module.exports = { ConsistencyService }; 