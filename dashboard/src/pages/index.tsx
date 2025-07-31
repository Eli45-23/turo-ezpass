import { useState, useEffect } from 'react';
import { User } from '@/types';
import { authService, CognitoUser } from '@/services/auth';
import LoginForm from '@/components/LoginForm';
import Dashboard from '@/components/Dashboard';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const checkAuthState = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        if (currentUser) {
          setUser({
            username: currentUser.username,
            isAuthenticated: currentUser.isAuthenticated
          });
        }
      } catch (error) {
        console.error('Error checking auth state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthState();
  }, []);

  const handleLogin = async (username: string, password?: string) => {
    try {
      if (authService.isConfigured() && password) {
        // Use Cognito authentication
        await authService.signIn(username, password);
        const currentUser = await authService.getCurrentUser();
        if (currentUser) {
          setUser({
            username: currentUser.username,
            isAuthenticated: currentUser.isAuthenticated
          });
        }
      } else {
        // Use demo authentication
        const newUser: User = {
          username,
          isAuthenticated: true
        };
        setUser(newUser);
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      await authService.signOut();
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
      setUser(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {!user?.isAuthenticated ? (
        <LoginForm onLogin={handleLogin} />
      ) : (
        <Dashboard user={user} onLogout={handleLogout} />
      )}
    </div>
  );
}