const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Configure AWS SDK with validation
const validateAWSConfig = () => {
  const required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME'];
  const missing = required.filter(key => !process.env[key] || process.env[key] === 'placeholder');
  
  if (missing.length > 0) {
    console.warn('⚠️  AWS S3 not configured. Missing:', missing.join(', '));
    return false;
  }
  return true;
};

const isAWSConfigured = validateAWSConfig();

let s3 = null;
let BUCKET_NAME = null;

if (isAWSConfigured) {
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  });

  s3 = new AWS.S3();
  BUCKET_NAME = process.env.S3_BUCKET_NAME;
  console.log('✅ AWS S3 configured for bucket:', BUCKET_NAME);
} else {
  console.log('📝 AWS S3 disabled - using database storage fallback');
}

/**
 * Generate S3 key for file storage
 * Format: projects/{projectId}/files/{fileId}/{fileName}
 */
const generateS3Key = (projectId, fileId, fileName) => {
  return `projects/${projectId}/files/${fileId}/${fileName}`;
};

/**
 * Upload file content to S3 (with fallback)
 */
const uploadFile = async (key, content, contentType = 'text/plain') => {
  if (!isAWSConfigured || !s3) {
    console.log('📝 AWS S3 not configured - skipping upload for:', key);
    return null; // Fallback to database storage
  }

  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: content,
      ContentType: contentType,
      ServerSideEncryption: 'AES256'
    };

    const result = await s3.upload(params).promise();
    console.log(`✅ File uploaded to S3: ${key}`);
    return result.Location;
  } catch (error) {
    console.error(`❌ S3 upload error for key ${key}:`, error.message);
    
    // Provide helpful error messages
    if (error.code === 'NoSuchBucket') {
      console.error('💡 Bucket does not exist. Check S3_BUCKET_NAME in .env');
    } else if (error.code === 'InvalidAccessKeyId') {
      console.error('💡 Invalid access key. Check AWS_ACCESS_KEY_ID in .env');
    } else if (error.code === 'SignatureDoesNotMatch') {
      console.error('💡 Invalid secret key. Check AWS_SECRET_ACCESS_KEY in .env');
    }
    
    return null; // Fallback to database storage
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

/**
 * Download file content from S3
 */
const getFile = async (key) => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };

    const result = await s3.getObject(params).promise();
    return result.Body.toString('utf-8');
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      throw new Error(`File not found: ${key}`);
    }
    console.error(`❌ S3 download error for key ${key}:`, error);
    throw new Error(`Failed to download file: ${error.message}`);
  }
};

/**
 * Delete file from S3
 */
const deleteFile = async (key) => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };

    await s3.deleteObject(params).promise();
    console.log(`🗑️  File deleted from S3: ${key}`);
  } catch (error) {
    console.error(`❌ S3 delete error for key ${key}:`, error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

/**
 * Delete multiple files from S3
 */
const deleteFiles = async (keys) => {
  if (!keys || keys.length === 0) {
    return;
  }

  try {
    const params = {
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: keys.map(key => ({ Key: key })),
        Quiet: false
      }
    };

    const result = await s3.deleteObjects(params).promise();
    console.log(`🗑️  ${result.Deleted.length} files deleted from S3`);

    if (result.Errors && result.Errors.length > 0) {
      console.error('❌ Some files failed to delete:', result.Errors);
    }
  } catch (error) {
    console.error('❌ S3 batch delete error:', error);
    throw new Error(`Failed to delete files: ${error.message}`);
  }
};

/**
 * Check if file exists in S3
 */
const fileExists = async (key) => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };

    await s3.headObject(params).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
};

/**
 * Get file metadata from S3
 */
const getFileMetadata = async (key) => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key
    };

    const result = await s3.headObject(params).promise();
    return {
      size: result.ContentLength,
      lastModified: result.LastModified,
      contentType: result.ContentType,
      etag: result.ETag
    };
  } catch (error) {
    if (error.code === 'NotFound') {
      throw new Error(`File not found: ${key}`);
    }
    throw new Error(`Failed to get file metadata: ${error.message}`);
  }
};

/**
 * Copy file within S3
 */
const copyFile = async (sourceKey, destinationKey) => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      CopySource: `${BUCKET_NAME}/${sourceKey}`,
      Key: destinationKey
    };

    await s3.copyObject(params).promise();
    console.log(`📋 File copied from ${sourceKey} to ${destinationKey}`);
  } catch (error) {
    console.error(`❌ S3 copy error:`, error);
    throw new Error(`Failed to copy file: ${error.message}`);
  }
};

module.exports = {
  generateS3Key,
  uploadFile,
  getFile,
  deleteFile,
  deleteFiles,
  fileExists,
  getFileMetadata,
  copyFile
};