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

export interface APIResponse<T = any> {
  statusCode: number;
  headers: {
    'Content-Type': string;
    'Access-Control-Allow-Origin': string;
    'Access-Control-Allow-Headers': string;
    'Access-Control-Allow-Methods': string;
  };
  body: string;
}

export interface ListTripsResponse {
  trips: TripRecord[];
  count: number;
}

export interface ErrorResponse {
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