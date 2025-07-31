import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserSession } from 'amazon-cognito-identity-js';

// Cognito configuration - these will be injected via environment variables
const COGNITO_CONFIG = {
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
  userPoolWebClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
  region: process.env.NEXT_PUBLIC_AWS_REGION || 'us-east-1',
  domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN || ''
};

// Initialize Cognito User Pool
const userPool = new CognitoUserPool({
  UserPoolId: COGNITO_CONFIG.userPoolId,
  ClientId: COGNITO_CONFIG.userPoolWebClientId
});

export interface AuthUser {
  username: string;
  email?: string;
  isAuthenticated: boolean;
}

export interface AuthService {
  signIn(username: string, password: string): Promise<CognitoUserSession>;
  signUp(username: string, email: string, password: string): Promise<any>;
  confirmSignUp(username: string, code: string): Promise<any>;
  getCurrentUser(): Promise<AuthUser | null>;
  signOut(): Promise<void>;
  getAuthToken(): Promise<string | null>;
  isConfigured(): boolean;
}

class CognitoAuthService implements AuthService {
  /**
   * Check if Cognito is properly configured
   */
  isConfigured(): boolean {
    return !!(COGNITO_CONFIG.userPoolId && COGNITO_CONFIG.userPoolWebClientId);
  }

  /**
   * Sign in a user
   */
  signIn(username: string, password: string): Promise<CognitoUserSession> {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username: username,
        Pool: userPool
      });

      const authDetails = new AuthenticationDetails({
        Username: username,
        Password: password
      });

      user.authenticateUser(authDetails, {
        onSuccess: (session: CognitoUserSession) => {
          resolve(session);
        },
        onFailure: (error) => {
          reject(error);
        },
        newPasswordRequired: (userAttributes, requiredAttributes) => {
          // Handle new password required scenario
          reject(new Error('New password required'));
        }
      });
    });
  }

  /**
   * Sign up a new user
   */
  signUp(username: string, email: string, password: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const attributeList = [
        {
          Name: 'email',
          Value: email
        }
      ];

      userPool.signUp(username, password, attributeList, [], (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Confirm sign up with verification code
   */
  confirmSignUp(username: string, code: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username: username,
        Pool: userPool
      });

      user.confirmRegistration(code, true, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Get current authenticated user
   */
  getCurrentUser(): Promise<AuthUser | null> {
    return new Promise((resolve, reject) => {
      const user = userPool.getCurrentUser();

      if (!user) {
        resolve(null);
        return;
      }

      user.getSession((err: any, session: CognitoUserSession) => {
        if (err) {
          resolve(null);
          return;
        }

        if (!session.isValid()) {
          resolve(null);
          return;
        }

        user.getUserAttributes((err, attributes) => {
          if (err) {
            reject(err);
            return;
          }

          const email = attributes?.find(attr => attr.getName() === 'email')?.getValue();

          resolve({
            username: user.getUsername(),
            email,
            isAuthenticated: true
          });
        });
      });
    });
  }

  /**
   * Sign out current user
   */
  signOut(): Promise<void> {
    return new Promise((resolve) => {
      const user = userPool.getCurrentUser();
      if (user) {
        user.signOut();
      }
      resolve();
    });
  }

  /**
   * Get current user's auth token
   */
  getAuthToken(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const user = userPool.getCurrentUser();

      if (!user) {
        resolve(null);
        return;
      }

      user.getSession((err: any, session: CognitoUserSession) => {
        if (err) {
          resolve(null);
          return;
        }

        if (!session.isValid()) {
          resolve(null);
          return;
        }

        resolve(session.getIdToken().getJwtToken());
      });
    });
  }
}

// Demo auth service for when Cognito is not configured
class DemoAuthService implements AuthService {
  private currentUser: CognitoUser | null = null;

  isConfigured(): boolean {
    return false;
  }

  async signIn(username: string, password: string): Promise<any> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    this.currentUser = {
      username,
      email: `${username}@example.com`,
      isAuthenticated: true
    };
    
    // Store in localStorage for persistence
    localStorage.setItem('demo-user', JSON.stringify(this.currentUser));
    
    return Promise.resolve({});
  }

  async signUp(username: string, email: string, password: string): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 500));
    return Promise.resolve({});
  }

  async confirmSignUp(username: string, code: string): Promise<any> {
    await new Promise(resolve => setTimeout(resolve, 500));
    return Promise.resolve({});
  }

  async getCurrentUser(): Promise<CognitoUser | null> {
    if (this.currentUser) {
      return this.currentUser;
    }

    // Check localStorage
    const stored = localStorage.getItem('demo-user');
    if (stored) {
      try {
        this.currentUser = JSON.parse(stored);
        return this.currentUser;
      } catch {
        localStorage.removeItem('demo-user');
      }
    }

    return null;
  }

  async signOut(): Promise<void> {
    this.currentUser = null;
    localStorage.removeItem('demo-user');
  }

  async getAuthToken(): Promise<string | null> {
    return this.currentUser ? 'demo-token' : null;
  }
}

// Export the appropriate service based on configuration
export const authService: AuthService = new CognitoAuthService().isConfigured() 
  ? new CognitoAuthService() 
  : new DemoAuthService();

export { COGNITO_CONFIG };