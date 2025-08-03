const { ConsistencyService } = require("../services/consistencyService");

describe("ConsistencyService", () => {
  let consistencyService;

  beforeEach(() => {
    consistencyService = new ConsistencyService();
  });

  describe("Payment consistency verification", () => {
    it("should verify valid payment data", async () => {
      const result = await consistencyService.verifyPaymentConsistency(
        "550e8400-e29b-41d4-a716-446655440000",
        100.50,
        "default",
        "2025-08-03T20:00:00Z"
      );

      expect(result.consistent).toBe(true);
      expect(result.checks).toHaveLength(5);
      expect(result.summary.total).toBe(5);
      expect(result.summary.passed).toBe(5);
      expect(result.summary.failed).toBe(0);
    });

    it("should fail with invalid correlation ID", async () => {
      const result = await consistencyService.verifyPaymentConsistency(
        "invalid-uuid",
        100.50,
        "default",
        "2025-08-03T20:00:00Z"
      );

      expect(result.consistent).toBe(false);
      expect(result.summary.failed).toBe(1);
      
      const correlationIdCheck = result.checks.find(c => c.name === "correlation_id_format");
      expect(correlationIdCheck.result).toBe(false);
    });

    it("should fail with negative amount", async () => {
      const result = await consistencyService.verifyPaymentConsistency(
        "550e8400-e29b-41d4-a716-446655440000",
        -100.50,
        "default",
        "2025-08-03T20:00:00Z"
      );

      expect(result.consistent).toBe(false);
      
      const amountCheck = result.checks.find(c => c.name === "amount_format");
      expect(amountCheck.result).toBe(false);
    });

    it("should fail with invalid amount precision", async () => {
      const result = await consistencyService.verifyPaymentConsistency(
        "550e8400-e29b-41d4-a716-446655440000",
        100.555, // More than 2 decimal places
        "default",
        "2025-08-03T20:00:00Z"
      );

      expect(result.consistent).toBe(false);
      
      const amountCheck = result.checks.find(c => c.name === "amount_format");
      expect(amountCheck.result).toBe(false);
    });

    it("should fail with invalid processor type", async () => {
      const result = await consistencyService.verifyPaymentConsistency(
        "550e8400-e29b-41d4-a716-446655440000",
        100.50,
        "invalid-processor",
        "2025-08-03T20:00:00Z"
      );

      expect(result.consistent).toBe(false);
      
      const processorCheck = result.checks.find(c => c.name === "processor_type");
      expect(processorCheck.result).toBe(false);
    });

    it("should fail with invalid timestamp", async () => {
      const result = await consistencyService.verifyPaymentConsistency(
        "550e8400-e29b-41d4-a716-446655440000",
        100.50,
        "default",
        "invalid-timestamp"
      );

      expect(result.consistent).toBe(false);
      
      const timestampCheck = result.checks.find(c => c.name === "timestamp_format");
      expect(timestampCheck.result).toBe(false);
    });
  });

  describe("Summary consistency verification", () => {
    const validSummary = {
      default: { totalRequests: 10, totalAmount: 1000.50 },
      fallback: { totalRequests: 5, totalAmount: 500.25 },
    };

    it("should verify valid summary data", async () => {
      const result = await consistencyService.verifySummaryConsistency(
        validSummary,
        "2025-08-01T00:00:00Z",
        "2025-08-03T23:59:59Z"
      );

      expect(result.consistent).toBe(true);
      expect(result.checks).toHaveLength(4);
      expect(result.summary.total).toBe(4);
      expect(result.summary.passed).toBe(4);
      expect(result.summary.failed).toBe(0);
    });

    it("should fail with invalid summary structure", async () => {
      const invalidSummary = {
        default: { totalRequests: 10 }, // Missing totalAmount
        fallback: { totalAmount: 500.25 }, // Missing totalRequests
      };

      const result = await consistencyService.verifySummaryConsistency(
        invalidSummary,
        "2025-08-01T00:00:00Z",
        "2025-08-03T23:59:59Z"
      );

      expect(result.consistent).toBe(false);
      
      const structureCheck = result.checks.find(c => c.name === "summary_structure");
      expect(structureCheck.result).toBe(false);
    });

    it("should fail with negative amounts", async () => {
      const invalidSummary = {
        default: { totalRequests: 10, totalAmount: -1000.50 },
        fallback: { totalRequests: 5, totalAmount: 500.25 },
      };

      const result = await consistencyService.verifySummaryConsistency(
        invalidSummary,
        "2025-08-01T00:00:00Z",
        "2025-08-03T23:59:59Z"
      );

      expect(result.consistent).toBe(false);
      
      const amountsCheck = result.checks.find(c => c.name === "summary_amounts");
      expect(amountsCheck.result).toBe(false);
    });

    it("should fail with negative counts", async () => {
      const invalidSummary = {
        default: { totalRequests: -10, totalAmount: 1000.50 },
        fallback: { totalRequests: 5, totalAmount: 500.25 },
      };

      const result = await consistencyService.verifySummaryConsistency(
        invalidSummary,
        "2025-08-01T00:00:00Z",
        "2025-08-03T23:59:59Z"
      );

      expect(result.consistent).toBe(false);
      
      const countsCheck = result.checks.find(c => c.name === "summary_counts");
      expect(countsCheck.result).toBe(false);
    });

    it("should fail with invalid date range", async () => {
      const result = await consistencyService.verifySummaryConsistency(
        validSummary,
        "2025-08-03T23:59:59Z", // Later date
        "2025-08-01T00:00:00Z"   // Earlier date
      );

      expect(result.consistent).toBe(false);
      
      const dateRangeCheck = result.checks.find(c => c.name === "date_range");
      expect(dateRangeCheck.result).toBe(false);
    });

    it("should pass with no date range", async () => {
      const result = await consistencyService.verifySummaryConsistency(
        validSummary,
        null,
        null
      );

      expect(result.consistent).toBe(true);
      
      const dateRangeCheck = result.checks.find(c => c.name === "date_range");
      expect(dateRangeCheck).toBeDefined();
      expect(dateRangeCheck.result).toBe(true);
    });
  });

  describe("Individual validation functions", () => {
    describe("Correlation ID format", () => {
      it("should validate correct UUID v4", () => {
        const result = consistencyService.verifyCorrelationIdFormat(
          "550e8400-e29b-41d4-a716-446655440000"
        );
        expect(result.result).toBe(true);
      });

      it("should reject invalid UUID", () => {
        const result = consistencyService.verifyCorrelationIdFormat("invalid-uuid");
        expect(result.result).toBe(false);
      });

      it("should reject UUID v1", () => {
        const result = consistencyService.verifyCorrelationIdFormat(
          "550e8400-e29b-11d4-a716-446655440000"
        );
        expect(result.result).toBe(false);
      });
    });

    describe("Amount format", () => {
      it("should validate positive number with correct precision", () => {
        const result = consistencyService.verifyAmountFormat(100.50);
        expect(result.result).toBe(true);
      });

      it("should reject negative number", () => {
        const result = consistencyService.verifyAmountFormat(-100.50);
        expect(result.result).toBe(false);
      });

      it("should reject zero", () => {
        const result = consistencyService.verifyAmountFormat(0);
        expect(result.result).toBe(false);
      });

      it("should reject number with too many decimal places", () => {
        const result = consistencyService.verifyAmountFormat(100.555);
        expect(result.result).toBe(false);
      });

      it("should reject non-number", () => {
        const result = consistencyService.verifyAmountFormat("100.50");
        expect(result.result).toBe(false);
      });
    });

    describe("Processor type", () => {
      it("should validate default processor", () => {
        const result = consistencyService.verifyProcessorType("default");
        expect(result.result).toBe(true);
      });

      it("should validate fallback processor", () => {
        const result = consistencyService.verifyProcessorType("fallback");
        expect(result.result).toBe(true);
      });

      it("should reject invalid processor", () => {
        const result = consistencyService.verifyProcessorType("invalid");
        expect(result.result).toBe(false);
      });
    });

    describe("Timestamp format", () => {
      it("should validate correct ISO timestamp", () => {
        const result = consistencyService.verifyTimestampFormat("2025-08-03T20:00:00Z");
        expect(result.result).toBe(true);
      });

      it("should reject invalid timestamp", () => {
        const result = consistencyService.verifyTimestampFormat("invalid-timestamp");
        expect(result.result).toBe(false);
      });

      it("should reject timestamp without T", () => {
        const result = consistencyService.verifyTimestampFormat("2025-08-03 20:00:00Z");
        expect(result.result).toBe(false);
      });

      it("should reject timestamp without Z", () => {
        const result = consistencyService.verifyTimestampFormat("2025-08-03T20:00:00");
        expect(result.result).toBe(false);
      });
    });

    describe("Summary structure", () => {
      it("should validate complete summary structure", () => {
        const summary = {
          default: { totalRequests: 10, totalAmount: 1000.50 },
          fallback: { totalRequests: 5, totalAmount: 500.25 },
        };
        const result = consistencyService.verifySummaryStructure(summary);
        expect(result.result).toBe(true);
      });

      it("should reject missing default processor", () => {
        const summary = {
          fallback: { totalRequests: 5, totalAmount: 500.25 },
        };
        const result = consistencyService.verifySummaryStructure(summary);
        expect(result.result).toBe(false);
      });

      it("should reject missing fallback processor", () => {
        const summary = {
          default: { totalRequests: 10, totalAmount: 1000.50 },
        };
        const result = consistencyService.verifySummaryStructure(summary);
        expect(result.result).toBe(false);
      });

      it("should reject missing totalRequests", () => {
        const summary = {
          default: { totalAmount: 1000.50 },
          fallback: { totalRequests: 5, totalAmount: 500.25 },
        };
        const result = consistencyService.verifySummaryStructure(summary);
        expect(result.result).toBe(false);
      });

      it("should reject missing totalAmount", () => {
        const summary = {
          default: { totalRequests: 10 },
          fallback: { totalRequests: 5, totalAmount: 500.25 },
        };
        const result = consistencyService.verifySummaryStructure(summary);
        expect(result.result).toBe(false);
      });
    });

    describe("Summary amounts", () => {
      it("should validate non-negative amounts", () => {
        const summary = {
          default: { totalRequests: 10, totalAmount: 1000.50 },
          fallback: { totalRequests: 5, totalAmount: 0 },
        };
        const result = consistencyService.verifySummaryAmounts(summary);
        expect(result.result).toBe(true);
      });

      it("should reject negative amounts", () => {
        const summary = {
          default: { totalRequests: 10, totalAmount: -1000.50 },
          fallback: { totalRequests: 5, totalAmount: 500.25 },
        };
        const result = consistencyService.verifySummaryAmounts(summary);
        expect(result.result).toBe(false);
      });
    });

    describe("Summary counts", () => {
      it("should validate non-negative counts", () => {
        const summary = {
          default: { totalRequests: 10, totalAmount: 1000.50 },
          fallback: { totalRequests: 0, totalAmount: 0 },
        };
        const result = consistencyService.verifySummaryCounts(summary);
        expect(result.result).toBe(true);
      });

      it("should reject negative counts", () => {
        const summary = {
          default: { totalRequests: -10, totalAmount: 1000.50 },
          fallback: { totalRequests: 5, totalAmount: 500.25 },
        };
        const result = consistencyService.verifySummaryCounts(summary);
        expect(result.result).toBe(false);
      });
    });

    describe("Date range", () => {
      it("should validate valid date range", () => {
        const result = consistencyService.verifyDateRange(
          "2025-08-01T00:00:00Z",
          "2025-08-03T23:59:59Z"
        );
        expect(result.result).toBe(true);
      });

      it("should validate no date range", () => {
        const result = consistencyService.verifyDateRange(null, null);
        expect(result.result).toBe(true);
      });

      it("should reject invalid from date", () => {
        const result = consistencyService.verifyDateRange(
          "invalid-date",
          "2025-08-03T23:59:59Z"
        );
        expect(result.result).toBe(false);
      });

      it("should reject invalid to date", () => {
        const result = consistencyService.verifyDateRange(
          "2025-08-01T00:00:00Z",
          "invalid-date"
        );
        expect(result.result).toBe(false);
      });

      it("should reject inverted date range", () => {
        const result = consistencyService.verifyDateRange(
          "2025-08-03T23:59:59Z",
          "2025-08-01T00:00:00Z"
        );
        expect(result.result).toBe(false);
      });
    });
  });

  describe("Statistics", () => {
    it("should provide consistency statistics", () => {
      const stats = consistencyService.getConsistencyStats();
      
      expect(stats).toHaveProperty("totalAuditLogs");
      expect(stats).toHaveProperty("consistencyChecks");
      expect(stats).toHaveProperty("consistencyCheckResults");
      expect(stats).toHaveProperty("recentChecks");
    });
  });
}); 