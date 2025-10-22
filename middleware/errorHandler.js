const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error response
  let error = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    }
  };

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    error.error.code = 'VALIDATION_ERROR';
    error.error.message = messages.join(', ');
    return res.status(400).json(error);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error.error.code = 'DUPLICATE_FIELD';
    error.error.message = `${field} already exists`;
    return res.status(400).json(error);
  }

  // Mongoose cast error
  if (err.name === 'CastError') {
    error.error.code = 'INVALID_ID';
    error.error.message = 'Invalid resource ID';
    return res.status(400).json(error);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.error.code = 'INVALID_TOKEN';
    error.error.message = 'Invalid token';
    return res.status(401).json(error);
  }

  if (err.name === 'TokenExpiredError') {
    error.error.code = 'TOKEN_EXPIRED';
    error.error.message = 'Token expired';
    return res.status(401).json(error);
  }

  // Custom application errors
  if (err.statusCode) {
    error.error.code = err.code || 'APPLICATION_ERROR';
    error.error.message = err.message;
    return res.status(err.statusCode).json(error);
  }

  // Default server error
  res.status(500).json(error);
};

module.exports = errorHandler;