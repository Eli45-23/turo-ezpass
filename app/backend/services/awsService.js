const { 
  uploadToS3, 
  getSignedUrl, 
  deleteFromS3, 
  publishEvent, 
  getSecret, 
  healthCheck 
} = require('../config/aws');

class AWSService {
  constructor() {
    this.bucketName = process.env.S3_BUCKET_NAME;
    this.eventBusName = process.env.EVENT_BUS_NAME || 'default';
  }

  /**
   * File Storage Operations
   */
  async uploadFile(file, key, metadata = {}) {
    try {
      if (!this.bucketName) {
        throw new Error('S3_BUCKET_NAME environment variable not set');
      }

      const result = await uploadToS3(
        this.bucketName,
        key,
        file.buffer,
        file.mimetype,
        {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
          ...metadata
        }
      );

      console.log('File uploaded successfully:', {
        key: key,
        bucket: this.bucketName,
        size: file.size,
        type: file.mimetype
      });

      return {
        url: result.url,
        key: result.key,
        bucket: this.bucketName,
        etag: result.etag,
        size: file.size,
        contentType: file.mimetype,
        uploadedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('AWSService: File upload failed:', error);
      throw error;
    }
  }

  /**
   * Generate presigned URL for file access
   */
  async getFileUrl(key, expiresIn = 3600) {
    try {
      if (!this.bucketName) {
        throw new Error('S3_BUCKET_NAME environment variable not set');
      }

      const url = await getSignedUrl(this.bucketName, key, expiresIn);

      console.log('Generated presigned URL:', {
        key: key,
        expiresIn: expiresIn
      });

      return {
        url: url,
        key: key,
        expiresIn: expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
      };
    } catch (error) {
      console.error('AWSService: Generate file URL failed:', error);
      throw error;
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key) {
    try {
      if (!this.bucketName) {
        throw new Error('S3_BUCKET_NAME environment variable not set');
      }

      await deleteFromS3(this.bucketName, key);

      console.log('File deleted successfully:', {
        key: key,
        bucket: this.bucketName
      });

      return true;
    } catch (error) {
      console.error('AWSService: File deletion failed:', error);
      throw error;
    }
  }

  /**
   * Upload proof image for a job
   */
  async uploadProofImage(jobId, userId, file) {
    try {
      // Generate unique key for the proof image
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const extension = file.originalname.split('.').pop();
      const key = `proof-images/${userId}/${jobId}/${timestamp}.${extension}`;

      const result = await this.uploadFile(file, key, {
        jobId: jobId,
        userId: userId,
        type: 'proof-image'
      });

      console.log('Proof image uploaded:', {
        jobId: jobId,
        userId: userId,
        key: result.key
      });

      return result;
    } catch (error) {
      console.error('AWSService: Proof image upload failed:', error);
      throw error;
    }
  }

  /**
   * Event Publishing Operations
   */
  async publishJobEvent(eventType, jobData, userData, additionalData = {}) {
    try {
      const eventDetail = {
        job: jobData,
        user: userData,
        timestamp: new Date().toISOString(),
        source: 'turo-ezpass-api',
        ...additionalData
      };

      const eventId = await publishEvent(
        this.eventBusName,
        'turo-ezpass.jobs',
        eventType,
        eventDetail
      );

      console.log('Job event published:', {
        eventId: eventId,
        eventType: eventType,
        jobId: jobData.id
      });

      return eventId;
    } catch (error) {
      console.error('AWSService: Publish job event failed:', error);
      throw error;
    }
  }

  /**
   * Publish user event
   */
  async publishUserEvent(eventType, userData, additionalData = {}) {
    try {
      const eventDetail = {
        user: userData,
        timestamp: new Date().toISOString(),
        source: 'turo-ezpass-api',
        ...additionalData
      };

      const eventId = await publishEvent(
        this.eventBusName,
        'turo-ezpass.users',
        eventType,
        eventDetail
      );

      console.log('User event published:', {
        eventId: eventId,
        eventType: eventType,
        userId: userData.id
      });

      return eventId;
    } catch (error) {
      console.error('AWSService: Publish user event failed:', error);
      throw error;
    }
  }

  /**
   * Publish system event
   */
  async publishSystemEvent(eventType, eventData) {
    try {
      const eventDetail = {
        ...eventData,
        timestamp: new Date().toISOString(),
        source: 'turo-ezpass-api'
      };

      const eventId = await publishEvent(
        this.eventBusName,
        'turo-ezpass.system',
        eventType,
        eventDetail
      );

      console.log('System event published:', {
        eventId: eventId,
        eventType: eventType
      });

      return eventId;
    } catch (error) {
      console.error('AWSService: Publish system event failed:', error);
      throw error;
    }
  }

  /**
   * Secrets Management Operations
   */
  async getSecretValue(secretName) {
    try {
      const secret = await getSecret(secretName);

      console.log('Secret retrieved successfully:', {
        secretName: secretName
      });

      return secret;
    } catch (error) {
      console.error('AWSService: Get secret failed:', error);
      throw error;
    }
  }

  /**
   * Get database credentials from secrets
   */
  async getDatabaseCredentials() {
    try {
      const secretName = process.env.DB_CREDENTIALS_SECRET_NAME;
      
      if (!secretName) {
        throw new Error('DB_CREDENTIALS_SECRET_NAME environment variable not set');
      }

      const credentials = await this.getSecretValue(secretName);

      return {
        host: credentials.host,
        port: credentials.port,
        database: credentials.dbname,
        username: credentials.username,
        password: credentials.password
      };
    } catch (error) {
      console.error('AWSService: Get database credentials failed:', error);
      throw error;
    }
  }

  /**
   * Utility Operations
   */
  async checkHealth() {
    try {
      const healthStatus = await healthCheck();

      console.log('AWS services health check:', healthStatus);

      return {
        healthy: Object.values(healthStatus).every(status => status),
        services: healthStatus,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('AWSService: Health check failed:', error);
      return {
        healthy: false,
        services: {
          s3: false,
          eventBridge: false,
          secretsManager: false
        },
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Generate upload URL for client-side uploads
   */
  async generateUploadUrl(key, contentType, expiresIn = 3600) {
    try {
      if (!this.bucketName) {
        throw new Error('S3_BUCKET_NAME environment variable not set');
      }

      const AWS = require('aws-sdk');
      const s3 = new AWS.S3();

      const params = {
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
        Expires: expiresIn
      };

      const uploadUrl = await s3.getSignedUrlPromise('putObject', params);

      console.log('Generated upload URL:', {
        key: key,
        contentType: contentType,
        expiresIn: expiresIn
      });

      return {
        uploadUrl: uploadUrl,
        key: key,
        bucket: this.bucketName,
        expiresIn: expiresIn,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
      };
    } catch (error) {
      console.error('AWSService: Generate upload URL failed:', error);
      throw error;
    }
  }

  /**
   * Batch operations
   */
  async batchDeleteFiles(keys) {
    try {
      if (!this.bucketName) {
        throw new Error('S3_BUCKET_NAME environment variable not set');
      }

      const AWS = require('aws-sdk');
      const s3 = new AWS.S3();

      const deleteParams = {
        Bucket: this.bucketName,
        Delete: {
          Objects: keys.map(key => ({ Key: key }))
        }
      };

      const result = await s3.deleteObjects(deleteParams).promise();

      console.log('Batch file deletion completed:', {
        deleted: result.Deleted.length,
        errors: result.Errors.length
      });

      return {
        deleted: result.Deleted,
        errors: result.Errors,
        successful: result.Errors.length === 0
      };
    } catch (error) {
      console.error('AWSService: Batch delete files failed:', error);
      throw error;
    }
  }
}

module.exports = new AWSService();