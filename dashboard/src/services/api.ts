import { TripRecord, ListTripsResponse, ApiError, TriggerScrapeRequest, TriggerScrapeResponse } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown', message: 'Unknown error occurred' }));
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

export const api = {
  /**
   * Fetch all trips for a specific user
   */
  async getTrips(userId: string): Promise<ListTripsResponse> {
    return apiRequest<ListTripsResponse>(`/trips?userId=${encodeURIComponent(userId)}`);
  },

  /**
   * Fetch a specific trip by userId and scrapeDate
   */
  async getTrip(userId: string, scrapeDate: string): Promise<TripRecord> {
    return apiRequest<TripRecord>(`/trips/${encodeURIComponent(userId)}/${encodeURIComponent(scrapeDate)}`);
  },

  /**
   * Trigger a manual scrape for a specific user
   */
  async triggerScrape(userId: string, scrapeType?: string): Promise<TriggerScrapeResponse> {
    const requestData: TriggerScrapeRequest = {
      userId,
      scrapeType: scrapeType || 'manual'
    };

    return apiRequest<TriggerScrapeResponse>('/scrape', {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  },

  /**
   * Check if the API is healthy
   */
  async healthCheck(): Promise<{ status: string }> {
    try {
      // Try to make a request with a fake userId to test connectivity
      await this.getTrips('health-check');
      return { status: 'ok' };
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        // 400 is expected for invalid userId, means API is reachable
        return { status: 'ok' };
      }
      throw error;
    }
  }
};

export { ApiError };