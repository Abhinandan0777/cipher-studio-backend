const mongoose = require('mongoose');

/**
 * Check if MongoDB connection is ready
 */
const isConnected = () => {
  return mongoose.connection.readyState === 1;
};

/**
 * Validate MongoDB ObjectId
 */
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Create new ObjectId
 */
const createObjectId = () => {
  return new mongoose.Types.ObjectId();
};

/**
 * Handle database operation with error handling
 */
const handleDatabaseOperation = async (operation, errorMessage = 'Database operation failed') => {
  try {
    if (!isConnected()) {
      throw new Error('Database not connected');
    }
    
    return await operation();
  } catch (error) {
    console.error(`${errorMessage}:`, error);
    throw error;
  }
};

/**
 * Retry database operation with exponential backoff
 */
const retryOperation = async (operation, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        break;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Database operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

/**
 * Enhanced database operation handler with retry logic for persistence operations
 */
const handlePersistenceOperation = async (operation, operationName, options = {}) => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    enableRetry = true,
    context = {}
  } = options;

  if (!enableRetry) {
    return await handleDatabaseOperation(operation, `${operationName} failed`);
  }

  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!isConnected()) {
        throw new Error('Database connection lost');
      }
      
      const result = await operation();
      
      // Log successful operation after retry
      if (attempt > 1) {
        console.log(`${operationName} succeeded on attempt ${attempt}/${maxRetries}`);
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = isRetryableError(error);
      
      if (attempt === maxRetries || !isRetryable) {
        // Enhance error with retry context
        const enhancedError = new Error(`${operationName} failed after ${attempt} attempts: ${error.message}`);
        enhancedError.originalError = error;
        enhancedError.attempts = attempt;
        enhancedError.retryable = isRetryable;
        enhancedError.context = context;
        enhancedError.operationName = operationName;
        
        throw enhancedError;
      }
      
      // Calculate delay with jitter
      const delay = baseDelay * Math.pow(2, attempt - 1);
      const jitteredDelay = delay + Math.random() * 1000;
      
      console.warn(`${operationName} failed (attempt ${attempt}/${maxRetries}): ${error.message}. Retrying in ${Math.round(jitteredDelay)}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, jitteredDelay));
    }
  }
  
  throw lastError;
};

/**
 * Check if database error is retryable
 */
const isRetryableError = (error) => {
  if (!error) return false;
  
  const message = error.message?.toLowerCase() || '';
  
  // Connection errors
  if (message.includes('connection') || message.includes('timeout')) {
    return true;
  }
  
  // MongoDB specific retryable errors
  if (error.code) {
    // Network errors, timeouts, temporary failures
    const retryableCodes = [
      11000, // Duplicate key (might be temporary)
      16500, // Shard config stale
      189,   // Primary stepped down
      91,    // Shutdown in progress  
      7,     // HostNotFound
      6,     // HostUnreachable
      89,    // NetworkTimeout
      9001,  // SocketException
    ];
    
    if (retryableCodes.includes(error.code)) {
      return true;
    }
  }
  
  // Mongoose connection errors
  if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
    return true;
  }
  
  return false;
};

/**
 * Handle project save operations with enhanced error handling
 */
const handleProjectSave = async (operation, projectId, options = {}) => {
  return await handlePersistenceOperation(
    operation,
    `Project save (${projectId})`,
    {
      ...options,
      context: { projectId, operation: 'save' }
    }
  );
};

/**
 * Handle project load operations with enhanced error handling
 */
const handleProjectLoad = async (operation, projectId, options = {}) => {
  return await handlePersistenceOperation(
    operation,
    `Project load (${projectId})`,
    {
      ...options,
      context: { projectId, operation: 'load' }
    }
  );
};

/**
 * Handle file operations with enhanced error handling
 */
const handleFileOperation = async (operation, fileId, operationType, options = {}) => {
  return await handlePersistenceOperation(
    operation,
    `File ${operationType} (${fileId})`,
    {
      ...options,
      context: { fileId, operation: operationType }
    }
  );
};

module.exports = {
  isConnected,
  isValidObjectId,
  createObjectId,
  handleDatabaseOperation,
  retryOperation,
  handlePersistenceOperation,
  handleProjectSave,
  handleProjectLoad,
  handleFileOperation,
  isRetryableError
};