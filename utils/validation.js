const Joi = require('joi');

/**
 * Validation schemas for API endpoints
 */

// Domain validation schema
const domainSchema = Joi.object({
  domain: Joi.string()
    .required()
    .pattern(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i)
    .message('Domain must be a valid format (e.g., example.com)')
    .max(253)
    .trim()
});

// URL validation schema
const urlSchema = Joi.object({
  url: Joi.string()
    .required()
    .uri({ scheme: ['http', 'https'] })
    .message('URL must be a valid HTTP or HTTPS URL')
    .max(2048)
    .trim()
});

// Bulk URL validation schema
const bulkUrlSchema = Joi.object({
  urls: Joi.array()
    .items(
      Joi.string()
        .uri({ scheme: ['http', 'https'] })
        .max(2048)
    )
    .required()
    .min(1)
    .max(50)
    .message('Must provide between 1 and 50 valid URLs')
});

/**
 * Validation middleware factory
 * @param {Joi.ObjectSchema} schema - Joi validation schema
 * @returns {Function} Express middleware function
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace request body with validated and sanitized data
    req.body = value;
    next();
  };
};

module.exports = {
  validate,
  domainSchema,
  urlSchema,
  bulkUrlSchema
};
