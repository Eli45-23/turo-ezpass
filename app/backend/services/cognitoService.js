const cognito = require('../config/cognito');
const jwt = require('jsonwebtoken');

class CognitoService {
  /**
   * Sign up a new user
   */
  async signUp({ email, password, name, turoHostId }) {
    try {
      const result = await cognito.signUp({
        email,
        password,
        name,
        turoHostId
      });

      console.log('User signed up successfully:', {
        userSub: result.userSub,
        email: email
      });

      return {
        userSub: result.userSub,
        email: email,
        name: name,
        turoHostId: turoHostId,
        confirmed: result.confirmed,
        confirmationRequired: result.confirmationRequired
      };
    } catch (error) {
      console.error('CognitoService signup error:', error);
      throw this._transformError(error);
    }
  }

  /**
   * Sign in user
   */
  async signIn({ email, password }) {
    try {
      const result = await cognito.signIn({ email, password });

      if (result.challengeName) {
        return {
          requiresChallenge: true,
          challengeName: result.challengeName,
          challengeParameters: result.challengeParameters,
          session: result.session
        };
      }

      // Get user details from ID token
      const userDetails = await this.getUserFromIdToken(result.idToken);

      // Generate our own JWT token for API access
      const apiToken = this._generateApiToken(userDetails);

      console.log('User signed in successfully:', {
        userSub: userDetails.userSub,
        email: userDetails.email
      });

      return {
        user: userDetails,
        tokens: {
          accessToken: result.accessToken,
          idToken: result.idToken,
          refreshToken: result.refreshToken,
          apiToken: apiToken,
          tokenType: result.tokenType,
          expiresIn: result.expiresIn
        }
      };
    } catch (error) {
      console.error('CognitoService signin error:', error);
      throw this._transformError(error);
    }
  }

  /**
   * Refresh tokens
   */
  async refreshToken(refreshToken) {
    try {
      const result = await cognito.refreshToken(refreshToken);

      // Get user details from new ID token
      const userDetails = await this.getUserFromIdToken(result.idToken);

      // Generate new API token
      const apiToken = this._generateApiToken(userDetails);

      return {
        user: userDetails,
        tokens: {
          accessToken: result.accessToken,
          idToken: result.idToken,
          apiToken: apiToken,
          tokenType: result.tokenType,
          expiresIn: result.expiresIn
        }
      };
    } catch (error) {
      console.error('CognitoService refresh token error:', error);
      throw this._transformError(error);
    }
  }

  /**
   * Get user details from access token
   */
  async getUserDetails(accessToken) {
    try {
      const result = await cognito.getUser(accessToken);

      return {
        userSub: result.userSub,
        username: result.username,
        email: result.email,
        name: result.name,
        turoHostId: result.turoHostId,
        emailVerified: result.emailVerified,
        enabled: result.enabled,
        userStatus: result.userStatus,
        createdDate: result.createdDate,
        modifiedDate: result.modifiedDate
      };
    } catch (error) {
      console.error('CognitoService get user details error:', error);
      throw this._transformError(error);
    }
  }

  /**
   * Get user details from ID token (JWT decode)
   */
  async getUserFromIdToken(idToken) {
    try {
      // Note: In production, you should verify the JWT signature
      // For now, we'll decode without verification for simplicity
      const decoded = jwt.decode(idToken);

      if (!decoded) {
        throw new Error('Invalid ID token');
      }

      return {
        userSub: decoded.sub,
        username: decoded['cognito:username'],
        email: decoded.email,
        name: decoded.name,
        turoHostId: decoded['custom:turo_host_id'],
        emailVerified: decoded.email_verified,
        tokenUse: decoded.token_use,
        aud: decoded.aud,
        iss: decoded.iss,
        exp: decoded.exp,
        iat: decoded.iat
      };
    } catch (error) {
      console.error('Error decoding ID token:', error);
      throw new Error('Invalid ID token');
    }
  }

  /**
   * Validate user exists and is active
   */
  async validateUser(userSub) {
    try {
      const result = await cognito.validateUser(userSub);

      if (!result.exists) {
        throw new Error('User not found');
      }

      if (!result.enabled) {
        throw new Error('User account is disabled');
      }

      if (result.userStatus !== 'CONFIRMED') {
        throw new Error('User account not confirmed');
      }

      return true;
    } catch (error) {
      console.error('CognitoService validate user error:', error);
      throw error;
    }
  }

  /**
   * Confirm user signup
   */
  async confirmSignUp(email, confirmationCode) {
    try {
      await cognito.confirmSignUp(email, confirmationCode);

      console.log('User signup confirmed:', { email });
      return true;
    } catch (error) {
      console.error('CognitoService confirm signup error:', error);
      throw this._transformError(error);
    }
  }

  /**
   * Resend confirmation code
   */
  async resendConfirmationCode(email) {
    try {
      const result = await cognito.resendConfirmationCode(email);

      console.log('Confirmation code resent:', { 
        email, 
        deliveryMedium: result.deliveryMedium 
      });

      return {
        deliveryMedium: result.deliveryMedium,
        destination: result.destination
      };
    } catch (error) {
      console.error('CognitoService resend confirmation error:', error);
      throw this._transformError(error);
    }
  }

  /**
   * Sign out user globally
   */
  async signOut(accessToken) {
    try {
      await cognito.globalSignOut(accessToken);

      console.log('User signed out globally');
      return true;
    } catch (error) {
      console.error('CognitoService signout error:', error);
      throw this._transformError(error);
    }
  }

  /**
   * Generate API token for internal use
   */
  _generateApiToken(userDetails) {
    const payload = {
      userSub: userDetails.userSub,
      email: userDetails.email,
      name: userDetails.name,
      turoHostId: userDetails.turoHostId,
      tokenType: 'api',
      iss: 'turo-ezpass-api',
      aud: 'turo-ezpass-client'
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });
  }

  /**
   * Verify API token
   */
  verifyApiToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded.tokenType !== 'api') {
        throw new Error('Invalid token type');
      }

      return {
        userSub: decoded.userSub,
        email: decoded.email,
        name: decoded.name,
        turoHostId: decoded.turoHostId
      };
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Transform Cognito errors to user-friendly messages
   */
  _transformError(error) {
    const errorMap = {
      'UsernameExistsException': 'User already exists with this email',
      'UserNotFoundException': 'User not found',
      'NotAuthorizedException': 'Invalid credentials',
      'UserNotConfirmedException': 'User email not confirmed',
      'CodeMismatchException': 'Invalid verification code',
      'ExpiredCodeException': 'Verification code expired',
      'InvalidPasswordException': 'Password does not meet requirements',
      'LimitExceededException': 'Too many requests. Please try again later',
      'TooManyRequestsException': 'Too many requests. Please try again later',
      'InvalidParameterException': 'Invalid parameters provided'
    };

    const transformedMessage = errorMap[error.code] || error.message;
    const transformedError = new Error(transformedMessage);
    transformedError.code = error.code;
    transformedError.statusCode = this._getStatusCode(error.code);

    return transformedError;
  }

  /**
   * Get appropriate HTTP status code for Cognito errors
   */
  _getStatusCode(errorCode) {
    const statusCodeMap = {
      'UsernameExistsException': 400,
      'UserNotFoundException': 404,
      'NotAuthorizedException': 401,
      'UserNotConfirmedException': 400,
      'CodeMismatchException': 400,
      'ExpiredCodeException': 400,
      'InvalidPasswordException': 400,
      'LimitExceededException': 429,
      'TooManyRequestsException': 429,
      'InvalidParameterException': 400
    };

    return statusCodeMap[errorCode] || 500;
  }

  /**
   * Health check for Cognito service
   */
  async healthCheck() {
    try {
      return await cognito.healthCheck();
    } catch (error) {
      console.error('CognitoService health check failed:', error);
      return false;
    }
  }
}

module.exports = new CognitoService();