import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TripRecord, APIResponse, ListTripsResponse, ErrorResponse, TriggerScrapeRequest, TriggerScrapeResponse, APIInfoResponse } from './types';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);
const eventBridgeClient = new EventBridgeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'turo_ezpass_trips';
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME || 'default';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // TODO: Restrict to your domain in production
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

function createResponse<T>(statusCode: number, body: T, prettyPrint: boolean = false, contentType: string = 'application/json'): APIResponse<T> {
  const headers = {
    ...corsHeaders,
    'Content-Type': contentType
  };

  return {
    statusCode,
    headers,
    body: prettyPrint ? JSON.stringify(body, null, 2) : JSON.stringify(body)
  };
}

function createErrorResponse(statusCode: number, error: string, message: string): APIResponse<ErrorResponse> {
  return createResponse(statusCode, { error, message }, true);
}

async function getAPIInfo(acceptHeader?: string): Promise<APIResponse<APIInfoResponse & { meta?: any }>> {
  // Check if this is a browser request (looks for text/html in Accept header)
  const isBrowserRequest = acceptHeader && acceptHeader.includes('text/html');
  
  const apiInfo = {
    name: "Turo-EZPass API",
    description: "Automated toll payment system API for Turo rental trips",
    version: "1.0.0",
    status: "operational",
    timestamp: new Date().toISOString(),
    endpoints: [
      {
        path: "/",
        method: "GET",
        description: "API information and documentation",
        authentication: "none",
        example: "GET https://api.turoezpass.com/"
      },
      {
        path: "/trips",
        method: "GET",
        description: "List all trips for a user",
        authentication: "required",
        parameters: ["userId (required)"],
        example: "GET https://api.turoezpass.com/trips?userId=your-user-id"
      },
      {
        path: "/trips/{userId}/{scrapeDate}",
        method: "GET",
        description: "Get a specific trip by user ID and scrape date",
        authentication: "required",
        parameters: ["userId (path)", "scrapeDate (path)"],
        example: "GET https://api.turoezpass.com/trips/your-user-id/2025-07-31T10:00:00Z"
      },
      {
        path: "/scrape",
        method: "POST",
        description: "Trigger a new scraping operation",
        authentication: "required",
        parameters: ["userId (body)", "scrapeType (optional, body)"],
        example: 'POST https://api.turoezpass.com/scrape\nBody: {"userId": "your-user-id", "scrapeType": "manual"}'
      }
    ],
    links: {
      documentation: "https://github.com/your-repo/turo-ezpass/blob/main/README.md",
      dashboard: "https://dashboard.turoezpass.com",
      support: "https://github.com/your-repo/turo-ezpass/issues"
    },
    ...(isBrowserRequest && {
      meta: {
        message: "👋 Welcome! This API provides trip data and toll automation for Turo rentals.",
        tip: "For a better experience, visit our dashboard at https://dashboard.turoezpass.com",
        note: "All endpoints except '/' require authentication via Cognito JWT tokens."
      }
    })
  };

  // Always use pretty-printing for better readability, especially for browser users
  return createResponse(200, apiInfo, true, 'application/json');
}

async function listTrips(userId: string): Promise<APIResponse<ListTripsResponse | ErrorResponse>> {
  try {
    if (!userId) {
      return createErrorResponse(400, 'BadRequest', 'userId parameter is required');
    }

    const command = new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      },
      ScanIndexForward: false // Sort by scrapeDate descending
    });

    const response = await docClient.send(command);
    const trips = (response.Items || []) as TripRecord[];

    return createResponse(200, {
      trips,
      count: trips.length
    }, true);
  } catch (error) {
    console.error('Error listing trips:', error);
    return createErrorResponse(500, 'InternalServerError', 'Failed to retrieve trips');
  }
}

async function getTrip(userId: string, scrapeDate: string): Promise<APIResponse<TripRecord | ErrorResponse>> {
  try {
    if (!userId || !scrapeDate) {
      return createErrorResponse(400, 'BadRequest', 'userId and scrapeDate parameters are required');
    }

    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        userId,
        scrapeDate
      }
    });

    const response = await docClient.send(command);

    if (!response.Item) {
      return createErrorResponse(404, 'NotFound', 'Trip not found');
    }

    return createResponse(200, response.Item as TripRecord, true);
  } catch (error) {
    console.error('Error getting trip:', error);
    return createErrorResponse(500, 'InternalServerError', 'Failed to retrieve trip');
  }
}

async function triggerScrape(userId: string, scrapeType?: string): Promise<APIResponse<TriggerScrapeResponse | ErrorResponse>> {
  try {
    if (!userId) {
      return createErrorResponse(400, 'BadRequest', 'userId parameter is required');
    }

    const eventDetail = {
      userId,
      scrapeType: scrapeType || 'manual',
      timestamp: new Date().toISOString(),
      source: 'api-triggered'
    };

    const command = new PutEventsCommand({
      Entries: [
        {
          Source: 'turo-ezpass.api',
          DetailType: 'Manual Scrape Request',
          Detail: JSON.stringify(eventDetail),
          EventBusName: EVENT_BUS_NAME
        }
      ]
    });

    const response = await eventBridgeClient.send(command);
    
    console.log('EventBridge response:', response);

    if (response.FailedEntryCount && response.FailedEntryCount > 0) {
      console.error('Failed to send event:', response.Entries);
      return createErrorResponse(500, 'InternalServerError', 'Failed to trigger scrape');
    }

    return createResponse(200, {
      message: 'Scrape triggered successfully',
      userId,
      scrapeType: scrapeType || 'manual',
      eventId: response.Entries?.[0]?.EventId || 'unknown',
      timestamp: eventDetail.timestamp
    }, true);
  } catch (error) {
    console.error('Error triggering scrape:', error);
    return createErrorResponse(500, 'InternalServerError', 'Failed to trigger scrape');
  }
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {});
  }

  const { httpMethod, pathParameters, queryStringParameters, body, headers } = event;

  try {
    // Handle GET requests
    if (httpMethod === 'GET') {
      // Route: GET / (root endpoint)
      if (event.resource === '/' || event.path === '/') {
        const acceptHeader = headers?.Accept || headers?.accept;
        return await getAPIInfo(acceptHeader);
      }

      // Route: GET /trips/{userId}/{scrapeDate}
      if (pathParameters?.userId && pathParameters?.scrapeDate) {
        return await getTrip(pathParameters.userId, pathParameters.scrapeDate);
      }

      // Route: GET /trips?userId={userId}
      if (queryStringParameters?.userId) {
        return await listTrips(queryStringParameters.userId);
      }

      return createErrorResponse(400, 'BadRequest', 'Invalid request. Use GET / for API info, GET /trips?userId={userId} to list trips, or GET /trips/{userId}/{scrapeDate} for specific trip');
    }

    // Handle POST requests
    if (httpMethod === 'POST') {
      // Route: POST /scrape
      if (event.resource === '/scrape' || event.path === '/scrape') {
        if (!body) {
          return createErrorResponse(400, 'BadRequest', 'Request body is required');
        }

        let requestData: TriggerScrapeRequest;
        try {
          requestData = JSON.parse(body);
        } catch (error) {
          return createErrorResponse(400, 'BadRequest', 'Invalid JSON in request body');
        }

        if (!requestData.userId) {
          return createErrorResponse(400, 'BadRequest', 'userId is required in request body');
        }

        return await triggerScrape(requestData.userId, requestData.scrapeType);
      }

      return createErrorResponse(400, 'BadRequest', 'Invalid POST endpoint. Use POST /scrape');
    }

    return createErrorResponse(405, 'MethodNotAllowed', 'Only GET and POST methods are allowed');
  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(500, 'InternalServerError', 'An unexpected error occurred');
  }
};