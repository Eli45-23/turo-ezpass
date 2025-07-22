const AWS = require('aws-sdk');

// Configure AWS for Cognito
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.AWS_ACCESS_KEY_ID && { 
    accessKeyId: process.env.AWS_ACCESS_KEY_ID 
  }),
  ...(process.env.AWS_SECRET_ACCESS_KEY && { 
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY 
  })
});

// Initialize Cognito services
const cognitoIdentityServiceProvider = new AWS.CognitoIdentityServiceProvider();

// Configuration constants
const COGNITO_CONFIG = {
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
  region: process.env.AWS_REGION || 'us-east-1'
};

/**
 * Validate Cognito configuration
 */
const validateConfig = () => {
  const required = ['COGNITO_USER_POOL_ID', 'COGNITO_CLIENT_ID'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required Cognito environment variables: ${missing.join(', ')}`);
  }
  
  return true;
};

/**
 * Sign up a new user
 */
const signUp = async ({ email, password, name, turoHostId }) => {
  try {
    validateConfig();

    const params = {
      ClientId: COGNITO_CONFIG.clientId,
      Username: email,
      Password: password,
      UserAttributes: [
        {
          Name: 'email',
          Value: email
        },
        {
          Name: 'name',
          Value: name
        },
        ...(turoHostId && [{
          Name: 'custom:turo_host_id',
          Value: turoHostId
        }])
      ],
      MessageAction: 'SUPPRESS' // Don't send welcome email automatically
    };

    const result = await cognitoIdentityServiceProvider.signUp(params).promise();

    console.log('User signed up successfully:', {
      userSub: result.UserSub,
      email: email,
      confirmed: result.UserConfirmed
    });

    return {
      userSub: result.UserSub,
      email: email,
      confirmed: result.UserConfirmed,
      confirmationRequired: !result.UserConfirmed
    };
  } catch (error) {
    console.error('Cognito signup error:', {
      email: email,
      error: error.message,
      code: error.code
    });
    throw error;
  }
};

/**
 * Authenticate user with email and password
 */
const signIn = async ({ email, password }) => {
  try {
    validateConfig();

    const params = {
      ClientId: COGNITO_CONFIG.clientId,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    };

    const result = await cognitoIdentityServiceProvider.initiateAuth(params).promise();

    if (result.ChallengeName) {
      console.log('Authentication challenge required:', {
        challengeName: result.ChallengeName,
        email: email
      });
      
      return {
        challengeName: result.ChallengeName,
        challengeParameters: result.ChallengeParameters,
        session: result.Session
      };
    }

    const tokens = result.AuthenticationResult;
    
    console.log('User signed in successfully:', {
      email: email,
      tokenType: tokens.TokenType
    });

    return {
      accessToken: tokens.AccessToken,
      idToken: tokens.IdToken,
      refreshToken: tokens.RefreshToken,
      tokenType: tokens.TokenType,
      expiresIn: tokens.ExpiresIn
    };
  } catch (error) {
    console.error('Cognito signin error:', {
      email: email,
      error: error.message,
      code: error.code
    });
    throw error;
  }
};

/**
 * Refresh access token using refresh token
 */
const refreshToken = async (refreshToken) => {
  try {
    validateConfig();

    const params = {
      ClientId: COGNITO_CONFIG.clientId,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: {
        REFRESH_TOKEN: refreshToken
      }
    };

    const result = await cognitoIdentityServiceProvider.initiateAuth(params).promise();
    const tokens = result.AuthenticationResult;

    console.log('Token refreshed successfully');

    return {
      accessToken: tokens.AccessToken,
      idToken: tokens.IdToken,
      tokenType: tokens.TokenType,
      expiresIn: tokens.ExpiresIn
    };
  } catch (error) {
    console.error('Cognito token refresh error:', {
      error: error.message,
      code: error.code
    });
    throw error;
  }
};

/**
 * Get user details from Cognito
 */
const getUser = async (accessToken) => {
  try {
    const params = {
      AccessToken: accessToken
    };

    const result = await cognitoIdentityServiceProvider.getUser(params).promise();

    const attributes = {};
    result.UserAttributes.forEach(attr => {
      attributes[attr.Name] = attr.Value;
    });

    console.log('User details retrieved successfully:', {
      username: result.Username,
      email: attributes.email
    });

    return {
      userSub: attributes.sub,
      username: result.Username,
      email: attributes.email,
      name: attributes.name,
      turoHostId: attributes['custom:turo_host_id'],
      emailVerified: attributes.email_verified === 'true',
      enabled: result.UserStatus === 'CONFIRMED',
      userStatus: result.UserStatus,
      createdDate: result.UserCreateDate,
      modifiedDate: result.UserLastModifiedDate
    };
  } catch (error) {
    console.error('Cognito get user error:', {
      error: error.message,
      code: error.code
    });
    throw error;
  }
};

/**
 * Validate user exists and is active
 */
const validateUser = async (userSub) => {
  try {
    validateConfig();

    const params = {
      UserPoolId: COGNITO_CONFIG.userPoolId,
      Username: userSub
    };

    const result = await cognitoIdentityServiceProvider.adminGetUser(params).promise();

    return {
      exists: true,
      enabled: result.Enabled,
      userStatus: result.UserStatus
    };
  } catch (error) {
    if (error.code === 'UserNotFoundException') {
      return {
        exists: false,
        enabled: false,
        userStatus: null
      };
    }
    
    console.error('Cognito validate user error:', {
      userSub: userSub,
      error: error.message,
      code: error.code
    });
    throw error;
  }
};

/**
 * Confirm user signup with verification code
 */
const confirmSignUp = async (email, confirmationCode) => {
  try {
    validateConfig();

    const params = {
      ClientId: COGNITO_CONFIG.clientId,
      Username: email,
      ConfirmationCode: confirmationCode
    };

    await cognitoIdentityServiceProvider.confirmSignUp(params).promise();

    console.log('User signup confirmed successfully:', {
      email: email
    });

    return true;
  } catch (error) {
    console.error('Cognito confirm signup error:', {
      email: email,
      error: error.message,
      code: error.code
    });
    throw error;
  }
};

/**
 * Resend confirmation code
 */
const resendConfirmationCode = async (email) => {
  try {
    validateConfig();

    const params = {
      ClientId: COGNITO_CONFIG.clientId,
      Username: email
    };

    const result = await cognitoIdentityServiceProvider.resendConfirmationCode(params).promise();

    console.log('Confirmation code resent successfully:', {
      email: email,
      deliveryMedium: result.CodeDeliveryDetails.DeliveryMedium
    });

    return {
      deliveryMedium: result.CodeDeliveryDetails.DeliveryMedium,
      destination: result.CodeDeliveryDetails.Destination
    };
  } catch (error) {
    console.error('Cognito resend confirmation error:', {
      email: email,
      error: error.message,
      code: error.code
    });
    throw error;
  }
};

/**
 * Sign out user globally
 */
const globalSignOut = async (accessToken) => {
  try {
    const params = {
      AccessToken: accessToken
    };

    await cognitoIdentityServiceProvider.globalSignOut(params).promise();

    console.log('User signed out globally');
    return true;
  } catch (error) {
    console.error('Cognito global signout error:', {
      error: error.message,
      code: error.code
    });
    throw error;
  }
};

/**
 * Health check for Cognito service
 */
const healthCheck = async () => {
  try {
    validateConfig();
    
    // Test by describing the user pool
    const params = {
      UserPoolId: COGNITO_CONFIG.userPoolId
    };

    await cognitoIdentityServiceProvider.describeUserPool(params).promise();
    return true;
  } catch (error) {
    console.error('Cognito health check failed:', error.message);
    return false;
  }
};

module.exports = {
  // Core authentication functions
  signUp,
  signIn,
  refreshToken,
  getUser,
  validateUser,
  confirmSignUp,
  resendConfirmationCode,
  globalSignOut,
  
  // Health check
  healthCheck,
  
  // Configuration
  config: COGNITO_CONFIG,
  
  // AWS service instance
  cognitoIdentityServiceProvider
};