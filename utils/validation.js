const Joi = require('joi');

// Common validation schemas
const objectIdSchema = Joi.alternatives().try(
  Joi.string().regex(/^[0-9a-fA-F]{24}$/).message('Invalid ObjectId format'),
  Joi.string().min(1).max(50).message('Invalid ID format') // More flexible for development
);

// Flexible userId schema that allows both ObjectId and test/development IDs
const userIdSchema = Joi.alternatives().try(
  objectIdSchema,
  Joi.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/).message('Invalid userId format')
);

// User validation schemas
const userSchemas = {
  register: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().min(6).required().messages({
      'string.min': 'Password must be at least 6 characters long',
      'any.required': 'Password is required'
    })
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  })
};

// Project validation schemas
const projectSchemas = {
  create: Joi.object({
    name: Joi.string().trim().min(1).max(100).required().messages({
      'string.min': 'Project name cannot be empty',
      'string.max': 'Project name cannot exceed 100 characters',
      'any.required': 'Project name is required'
    }),
    description: Joi.string().trim().max(500).optional().messages({
      'string.max': 'Description cannot exceed 500 characters'
    }),
    userId: userIdSchema.required()
  }),

  update: Joi.object({
    name: Joi.string().trim().min(1).max(100).optional(),
    description: Joi.string().trim().max(500).optional()
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update'
  })
};

// File validation schemas
const fileSchemas = {
  create: Joi.object({
    projectId: objectIdSchema.required(),
    name: Joi.string().trim().min(1).max(255).required().messages({
      'string.min': 'File name cannot be empty',
      'string.max': 'File name cannot exceed 255 characters',
      'any.required': 'File name is required'
    }),
    type: Joi.string().valid('file', 'folder').required().messages({
      'any.only': 'Type must be either "file" or "folder"',
      'any.required': 'File type is required'
    }),
    parentId: objectIdSchema.optional().allow(null),
    content: Joi.when('type', {
      is: 'file',
      then: Joi.string().allow('').optional().default(''),
      otherwise: Joi.forbidden()
    }).messages({
      'any.unknown': 'Content is not allowed for folders'
    })
  }),

  update: Joi.object({
    name: Joi.string().trim().min(1).max(255).optional(),
    content: Joi.string().optional(),
    parentId: objectIdSchema.optional().allow(null)
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update'
  })
};

/**
 * Validate request data against schema
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errorMessages = error.details.map(detail => detail.message);
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errorMessages
        }
      });
    }

    req.validatedData = value;
    next();
  };
};

/**
 * Validate ObjectId parameter
 */
const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    const { error } = objectIdSchema.validate(id);

    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: `Invalid ${paramName} format`
        }
      });
    }

    next();
  };
};

/**
 * Validate UserId parameter (more flexible than ObjectId)
 */
const validateUserId = (paramName = 'userId') => {
  return (req, res, next) => {
    const id = req.params[paramName];
    const { error } = userIdSchema.validate(id);

    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_USER_ID',
          message: `Invalid ${paramName} format`
        }
      });
    }

    next();
  };
};

module.exports = {
  userSchemas,
  projectSchemas,
  fileSchemas,
  validate,
  validateObjectId,
  validateUserId,
  objectIdSchema,
  userIdSchema
};