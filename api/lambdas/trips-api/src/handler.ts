import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TripRecord, APIResponse, ListTripsResponse, ErrorResponse, TriggerScrapeRequest, TriggerScrapeResponse } from './types';

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

function createResponse<T>(statusCode: number, body: T): APIResponse<T> {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
  };
}

function createErrorResponse(statusCode: number, error: string, message: string): APIResponse<ErrorResponse> {
  return createResponse(statusCode, { error, message });
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
    });
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

    return createResponse(200, response.Item as TripRecord);
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
    });
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

  const { httpMethod, pathParameters, queryStringParameters, body } = event;

  try {
    // Handle GET requests
    if (httpMethod === 'GET') {
      // Route: GET /trips/{userId}/{scrapeDate}
      if (pathParameters?.userId && pathParameters?.scrapeDate) {
        return await getTrip(pathParameters.userId, pathParameters.scrapeDate);
      }

      // Route: GET /trips?userId={userId}
      if (queryStringParameters?.userId) {
        return await listTrips(queryStringParameters.userId);
      }

      return createErrorResponse(400, 'BadRequest', 'Invalid request. Use GET /trips?userId={userId} or GET /trips/{userId}/{scrapeDate}');
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