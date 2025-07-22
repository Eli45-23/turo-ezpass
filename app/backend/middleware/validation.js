const Joi = require('joi');

/**
 * Generic validation middleware factory
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errorMessages
      });
    }

    // Replace the original property with the validated value
    req[property] = value;
    next();
  };
};

// User Registration Validation
const signupSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  
  password: Joi.string()
    .min(8)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required'
    }),
  
  name: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name cannot exceed 100 characters',
      'any.required': 'Name is required'
    }),
  
  turoHostId: Joi.string()
    .alphanum()
    .min(3)
    .max(50)
    .optional()
    .messages({
      'string.alphanum': 'Turo Host ID must contain only letters and numbers',
      'string.min': 'Turo Host ID must be at least 3 characters long',
      'string.max': 'Turo Host ID cannot exceed 50 characters'
    })
});

// User Login Validation
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

// Job Query Validation
const jobQuerySchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'processing', 'completed', 'failed', 'retry')
    .default('pending'),
  
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),
  
  sortBy: Joi.string()
    .valid('createdAt', 'updatedAt', 'tollAmount', 'tripStartDate', 'tollLocation')
    .default('createdAt'),
  
  sortOrder: Joi.string()
    .valid('asc', 'desc', 'ASC', 'DESC')
    .default('desc'),
  
  startDate: Joi.date()
    .iso()
    .optional(),
  
  endDate: Joi.date()
    .iso()
    .min(Joi.ref('startDate'))
    .optional()
    .messages({
      'date.min': 'End date must be after start date'
    }),
  
  tollLocation: Joi.string()
    .min(2)
    .max(200)
    .optional(),
  
  minAmount: Joi.number()
    .min(0)
    .precision(2)
    .optional(),
  
  maxAmount: Joi.number()
    .min(Joi.ref('minAmount'))
    .precision(2)
    .optional()
    .messages({
      'number.min': 'Maximum amount must be greater than minimum amount'
    })
});

// Job Creation Validation
const createJobSchema = Joi.object({
  turoTripId: Joi.string()
    .required()
    .messages({
      'any.required': 'Turo Trip ID is required'
    }),
  
  tollAmount: Joi.number()
    .positive()
    .precision(2)
    .required()
    .messages({
      'number.positive': 'Toll amount must be positive',
      'any.required': 'Toll amount is required'
    }),
  
  tollLocation: Joi.string()
    .min(2)
    .max(200)
    .required()
    .messages({
      'string.min': 'Toll location must be at least 2 characters',
      'string.max': 'Toll location cannot exceed 200 characters',
      'any.required': 'Toll location is required'
    }),
  
  tripStartDate: Joi.date()
    .iso()
    .max('now')
    .required()
    .messages({
      'date.max': 'Trip start date cannot be in the future',
      'any.required': 'Trip start date is required'
    }),
  
  tripEndDate: Joi.date()
    .iso()
    .min(Joi.ref('tripStartDate'))
    .max('now')
    .required()
    .messages({
      'date.min': 'Trip end date must be after start date',
      'date.max': 'Trip end date cannot be in the future',
      'any.required': 'Trip end date is required'
    }),
  
  proofImageUrl: Joi.string()
    .uri()
    .optional()
    .messages({
      'string.uri': 'Proof image URL must be a valid URL'
    }),
  
  status: Joi.string()
    .valid('pending', 'processing', 'completed', 'failed', 'retry')
    .default('pending')
});

// Job Update Validation
const updateJobSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'processing', 'completed', 'failed', 'retry')
    .optional(),
  
  errorMessage: Joi.string()
    .max(1000)
    .allow('')
    .optional(),
  
  submissionId: Joi.string()
    .max(100)
    .optional(),
  
  lastSubmissionDate: Joi.date()
    .iso()
    .optional(),
  
  submissionAttempts: Joi.number()
    .integer()
    .min(0)
    .optional()
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Bulk Operations Validation
const bulkJobsSchema = Joi.object({
  jobIds: Joi.array()
    .items(Joi.string().uuid())
    .min(1)
    .max(50)
    .required()
    .messages({
      'array.min': 'At least one job ID is required',
      'array.max': 'Maximum 50 jobs can be processed at once',
      'any.required': 'Job IDs array is required'
    }),
  
  updateData: Joi.object().optional()
});

// File Upload Validation
const fileUploadSchema = Joi.object({
  filename: Joi.string()
    .pattern(/\.(jpg|jpeg|png|pdf)$/i)
    .required()
    .messages({
      'string.pattern.base': 'File must be a JPG, PNG, or PDF',
      'any.required': 'Filename is required'
    }),
  
  fileSize: Joi.number()
    .max(10 * 1024 * 1024) // 10MB
    .required()
    .messages({
      'number.max': 'File size cannot exceed 10MB',
      'any.required': 'File size is required'
    }),
  
  mimeType: Joi.string()
    .valid('image/jpeg', 'image/png', 'image/jpg', 'application/pdf')
    .required()
    .messages({
      'any.only': 'File type must be JPEG, PNG, or PDF',
      'any.required': 'MIME type is required'
    })
});

// Middleware exports
const validateSignup = validate(signupSchema);
const validateLogin = validate(loginSchema);
const validateJobQuery = validate(jobQuerySchema, 'query');
const validateCreateJob = validate(createJobSchema);
const validateUpdateJob = validate(updateJobSchema);
const validateBulkJobs = validate(bulkJobsSchema);
const validateFileUpload = validate(fileUploadSchema);

// Custom validation middleware for request parameters
const validateParams = (schema) => {
  return validate(schema, 'params');
};

// UUID parameter validation
const uuidParamSchema = Joi.object({
  jobId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Job ID must be a valid UUID',
      'any.required': 'Job ID is required'
    })
});

const validateJobIdParam = validateParams(uuidParamSchema);

// Pagination validation helper
const validatePagination = validate(Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
}), 'query');

// Date range validation helper
const validateDateRange = validate(Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required()
}), 'query');

module.exports = {
  validate,
  validateSignup,
  validateLogin,
  validateJobQuery,
  validateCreateJob,
  validateUpdateJob,
  validateBulkJobs,
  validateFileUpload,
  validateJobIdParam,
  validatePagination,
  validateDateRange,
  
  // Export schemas for reuse
  schemas: {
    signupSchema,
    loginSchema,
    jobQuerySchema,
    createJobSchema,
    updateJobSchema,
    bulkJobsSchema,
    fileUploadSchema,
    uuidParamSchema
  }
};