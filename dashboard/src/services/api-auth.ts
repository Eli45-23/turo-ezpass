import { TripRecord, ListTripsResponse, TriggerScrapeRequest, TriggerScrapeResponse } from '@/types';
import { authService } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
const API_AUTH_URL = process.env.NEXT_PUBLIC_API_AUTH_URL || API_BASE_URL;

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function authenticatedApiRequest<T>(endpoint: string, options?: RequestInit, useAuth = true): Promise<T> {
  const baseUrl = useAuth && authService.isConfigured() ? API_AUTH_URL : API_BASE_URL;
  const url = `${baseUrl}${endpoint}`;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Add authorization header if using Cognito auth
  if (useAuth && authService.isConfigured()) {
    try {
      const token = await authService.getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Failed to get auth token:', error);
      throw new ApiError(401, 'Authentication failed');
    }
  }
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: 'Unknown', 
        message: `HTTP ${response.status}` 
      }));
      throw new ApiError(response.status, errorData.message || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Network or other errors
    throw new ApiError(0, error instanceof Error ? error.message : 'Network error');
  }
}

export const apiAuth = {
  /**
   * Fetch all trips for the current authenticated user
   */
  async getTrips(userId?: string): Promise<ListTripsResponse> {
    let endpoint = '/trips';
    
    // If not using Cognito auth, userId parameter is required
    if (!authService.isConfigured() && userId) {
      endpoint += `?userId=${encodeURIComponent(userId)}`;
    }
    // If using Cognito auth, userId is extracted from JWT token by the backend
    
    return authenticatedApiRequest<ListTripsResponse>(endpoint, undefined, true);
  },

  /**
   * Fetch a specific trip by userId and scrapeDate
   */
  async getTrip(userId: string, scrapeDate: string): Promise<TripRecord> {
    const endpoint = `/trips/${encodeURIComponent(userId)}/${encodeURIComponent(scrapeDate)}`;
    return authenticatedApiRequest<TripRecord>(endpoint, undefined, true);
  },

  /**
   * Trigger a manual scrape for the current authenticated user
   */
  async triggerScrape(userId?: string, scrapeType?: string): Promise<TriggerScrapeResponse> {
    let requestData: TriggerScrapeRequest;
    
    if (authService.isConfigured()) {
      // For Cognito auth, userId is extracted from JWT token by the backend
      requestData = {
        userId: 'auth-user', // This will be overridden by the backend
        scrapeType: scrapeType || 'manual'
      };
    } else {
      // For demo mode, userId is required
      if (!userId) {
        throw new ApiError(400, 'userId is required when not using authentication');
      }
      requestData = {
        userId,
        scrapeType: scrapeType || 'manual'
      };
    }

    return authenticatedApiRequest<TriggerScrapeResponse>('/scrape', {
      method: 'POST',
      body: JSON.stringify(requestData),
    }, authService.isConfigured());
  },

  /**
   * Check if the API is healthy
   */
  async healthCheck(): Promise<{ status: string }> {
    try {
      // Try to make a request to test connectivity
      if (authService.isConfigured()) {
        await authenticatedApiRequest<any>('/trips', undefined, true);
      } else {
        await authenticatedApiRequest<any>('/trips?userId=health-check', undefined, false);
      }
      return { status: 'ok' };
    } catch (error) {
      if (error instanceof ApiError && (error.status === 400 || error.status === 401)) {
        // 400/401 is expected for invalid requests, means API is reachable
        return { status: 'ok' };
      }
      throw error;
    }
  },

  /**
   * Check if authentication is configured
   */
  isAuthConfigured(): boolean {
    return authService.isConfigured();
  }
};

export { ApiError };