const Joi = require("joi");

// Schema for payment request validation
const paymentRequestSchema = Joi.object({
  correlationId: Joi.string().guid({ version: "uuidv4" }).required().messages({
    "string.guid": "correlationId must be a valid UUID",
    "any.required": "correlationId is required",
  }),
  amount: Joi.number().positive().precision(2).required().messages({
    "number.base": "amount must be a number",
    "number.positive": "amount must be positive",
    "number.precision": "amount must have maximum 2 decimal places",
    "any.required": "amount is required",
  }),
});

// Schema for payment summary query validation
const paymentSummaryQuerySchema = Joi.object({
  from: Joi.date().iso().optional().messages({
    "date.base": "from must be a valid ISO date string",
  }),
  to: Joi.date().iso().optional().greater(Joi.ref("from")).messages({
    "date.base": "to must be a valid ISO date string",
    "date.greater": "to must be greater than from",
  }),
});

// Validate payment request
const validatePaymentRequest = (data) => {
  return paymentRequestSchema.validate(data, { abortEarly: false });
};

// Validate payment summary query
const validatePaymentSummaryQuery = (data) => {
  return paymentSummaryQuerySchema.validate(data, { abortEarly: false });
};

module.exports = {
  validatePaymentRequest,
  validatePaymentSummaryQuery,
};
