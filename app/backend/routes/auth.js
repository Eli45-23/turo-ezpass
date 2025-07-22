const express = require('express');
const jwt = require('jsonwebtoken');
const cognitoService = require('../services/cognitoService');
const { validateSignup, validateLogin } = require('../middleware/validation');
const router = express.Router();

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new user with AWS Cognito
 * @access  Public
 */
router.post('/signup', validateSignup, async (req, res, next) => {
  try {
    const { email, password, name, turoHostId } = req.body;

    // Register user with Cognito
    const result = await cognitoService.signUp({
      email,
      password,
      name,
      turoHostId
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email for verification.',
      data: {
        userSub: result.userSub,
        email: email,
        confirmationRequired: !result.userConfirmed
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/confirm
 * @desc    Confirm user email with verification code
 * @access  Public
 */
router.post('/confirm', async (req, res, next) => {
  try {
    const { email, confirmationCode } = req.body;

    if (!email || !confirmationCode) {
      return res.status(400).json({
        success: false,
        message: 'Email and confirmation code are required'
      });
    }

    await cognitoService.confirmSignUp(email, confirmationCode);

    res.json({
      success: true,
      message: 'Email confirmed successfully. You can now log in.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return JWT tokens
 * @access  Public
 */
router.post('/login', validateLogin, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Authenticate with Cognito
    const authResult = await cognitoService.signIn(email, password);

    // Generate application JWT
    const payload = {
      userSub: authResult.userSub,
      email: authResult.email,
      name: authResult.name,
      turoHostId: authResult.turoHostId
    };

    const accessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    const refreshToken = jwt.sign(
      { userSub: authResult.userSub },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: authResult.userSub,
          email: authResult.email,
          name: authResult.name,
          turoHostId: authResult.turoHostId
        },
        tokens: {
          accessToken,
          refreshToken,
          cognitoTokens: {
            AccessToken: authResult.AccessToken,
            IdToken: authResult.IdToken,
            RefreshToken: authResult.RefreshToken
          }
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    // Get user data from Cognito (optional, for updated user info)
    const userData = await cognitoService.getUserData(decoded.userSub);

    // Generate new access token
    const payload = {
      userSub: userData.userSub,
      email: userData.email,
      name: userData.name,
      turoHostId: userData.turoHostId
    };

    const accessToken = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }
    next(error);
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and invalidate tokens
 * @access  Private
 */
router.post('/logout', async (req, res, next) => {
  try {
    const { cognitoAccessToken } = req.body;

    if (cognitoAccessToken) {
      // Sign out from Cognito (optional)
      await cognitoService.signOut(cognitoAccessToken);
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Initiate password reset
 * @access  Public
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    await cognitoService.forgotPassword(email);

    res.json({
      success: true,
      message: 'Password reset code sent to your email'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with confirmation code
 * @access  Public
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, confirmationCode, newPassword } = req.body;

    if (!email || !confirmationCode || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, confirmation code, and new password are required'
      });
    }

    await cognitoService.confirmForgotPassword(email, confirmationCode, newPassword);

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;