export interface TripRecord {
  userId: string;
  scrapeDate: string;
  totalRecords: number;
  summary: string;
  status: 'success' | 'failure';
  data?: any;
  error?: string;
  timestamp: string;
}

export interface ListTripsResponse {
  trips: TripRecord[];
  count: number;
}

export interface User {
  username: string;
  isAuthenticated: boolean;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface TriggerScrapeRequest {
  userId: string;
  scrapeType?: string;
}

export interface TriggerScrapeResponse {
  message: string;
  userId: string;
  scrapeType: string;
  eventId: string;
  timestamp: string;
}