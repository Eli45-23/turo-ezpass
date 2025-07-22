const AWS = require('aws-sdk');

// Configure AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.AWS_ACCESS_KEY_ID && { 
    accessKeyId: process.env.AWS_ACCESS_KEY_ID 
  }),
  ...(process.env.AWS_SECRET_ACCESS_KEY && { 
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY 
  })
});

// S3 Configuration
const s3Config = {
  region: process.env.AWS_REGION || 'us-east-1',
  signatureVersion: 'v4',
  ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
  ...(process.env.S3_FORCE_PATH_STYLE && { s3ForcePathStyle: true })
};

// EventBridge Configuration
const eventBridgeConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
};

// Secrets Manager Configuration
const secretsManagerConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
};

// Initialize AWS Services
const s3 = new AWS.S3(s3Config);
const eventBridge = new AWS.EventBridge(eventBridgeConfig);
const secretsManager = new AWS.SecretsManager(secretsManagerConfig);

/**
 * Upload file to S3 bucket
 */
const uploadToS3 = async (bucketName, key, buffer, contentType, metadata = {}) => {
  try {
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata,
      ServerSideEncryption: 'aws:kms',
      ...(process.env.S3_KMS_KEY_ID && { 
        SSEKMSKeyId: process.env.S3_KMS_KEY_ID 
      })
    };

    const result = await s3.upload(params).promise();
    
    console.log('File uploaded successfully:', {
      bucket: bucketName,
      key: key,
      location: result.Location,
      etag: result.ETag
    });

    return {
      url: result.Location,
      key: result.Key,
      etag: result.ETag,
      bucket: bucketName
    };
  } catch (error) {
    console.error('S3 upload error:', {
      bucket: bucketName,
      key: key,
      error: error.message
    });
    throw error;
  }
};

/**
 * Generate presigned URL for S3 object
 */
const getSignedUrl = async (bucketName, key, expiresIn = 3600) => {
  try {
    const params = {
      Bucket: bucketName,
      Key: key,
      Expires: expiresIn
    };

    const url = await s3.getSignedUrlPromise('getObject', params);
    return url;
  } catch (error) {
    console.error('S3 presigned URL error:', {
      bucket: bucketName,
      key: key,
      error: error.message
    });
    throw error;
  }
};

/**
 * Delete object from S3
 */
const deleteFromS3 = async (bucketName, key) => {
  try {
    const params = {
      Bucket: bucketName,
      Key: key
    };

    await s3.deleteObject(params).promise();
    
    console.log('File deleted successfully:', {
      bucket: bucketName,
      key: key
    });

    return true;
  } catch (error) {
    console.error('S3 delete error:', {
      bucket: bucketName,
      key: key,
      error: error.message
    });
    throw error;
  }
};

/**
 * Publish event to EventBridge
 */
const publishEvent = async (eventBusName, source, detailType, detail) => {
  try {
    const params = {
      Entries: [
        {
          Source: source,
          DetailType: detailType,
          Detail: JSON.stringify(detail),
          EventBusName: eventBusName || 'default',
          Time: new Date()
        }
      ]
    };

    const result = await eventBridge.putEvents(params).promise();
    
    if (result.FailedEntryCount > 0) {
      console.error('EventBridge publish failed:', result.Entries);
      throw new Error('Failed to publish event to EventBridge');
    }

    console.log('Event published successfully:', {
      eventBus: eventBusName,
      source: source,
      detailType: detailType,
      eventId: result.Entries[0].EventId
    });

    return result.Entries[0].EventId;
  } catch (error) {
    console.error('EventBridge publish error:', {
      eventBus: eventBusName,
      source: source,
      error: error.message
    });
    throw error;
  }
};

/**
 * Get secret from AWS Secrets Manager
 */
const getSecret = async (secretName) => {
  try {
    const params = {
      SecretId: secretName
    };

    const result = await secretsManager.getSecretValue(params).promise();
    
    if (result.SecretString) {
      return JSON.parse(result.SecretString);
    } else if (result.SecretBinary) {
      return Buffer.from(result.SecretBinary, 'base64').toString('ascii');
    }
    
    throw new Error('Secret value not found');
  } catch (error) {
    console.error('Secrets Manager error:', {
      secretName: secretName,
      error: error.message
    });
    throw error;
  }
};

/**
 * Health check for AWS services
 */
const healthCheck = async () => {
  const checks = {
    s3: false,
    eventBridge: false,
    secretsManager: false
  };

  try {
    // Test S3 access
    await s3.listBuckets().promise();
    checks.s3 = true;
  } catch (error) {
    console.warn('S3 health check failed:', error.message);
  }

  try {
    // Test EventBridge access
    await eventBridge.listEventBuses({ Limit: 1 }).promise();
    checks.eventBridge = true;
  } catch (error) {
    console.warn('EventBridge health check failed:', error.message);
  }

  try {
    // Test Secrets Manager access
    await secretsManager.listSecrets({ MaxResults: 1 }).promise();
    checks.secretsManager = true;
  } catch (error) {
    console.warn('Secrets Manager health check failed:', error.message);
  }

  return checks;
};

module.exports = {
  // AWS Service Instances
  s3,
  eventBridge,
  secretsManager,
  
  // S3 Functions
  uploadToS3,
  getSignedUrl,
  deleteFromS3,
  
  // EventBridge Functions
  publishEvent,
  
  // Secrets Manager Functions
  getSecret,
  
  // Health Check
  healthCheck,
  
  // Configuration
  config: {
    s3: s3Config,
    eventBridge: eventBridgeConfig,
    secretsManager: secretsManagerConfig
  }
};