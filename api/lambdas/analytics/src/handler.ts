import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { ScheduledEvent, Context } from 'aws-lambda';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudWatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'turo_ezpass_trips';
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;
const METRIC_NAMESPACE = process.env.METRIC_NAMESPACE || 'TuroEZPass';

interface TripRecord {
  userId: string;
  scrapeDate: string;
  totalRecords: number;
  summary: string;
  status: 'success' | 'failure';
  data?: any;
  error?: string;
  timestamp: string;
}

interface AnalyticsMetrics {
  totalScrapes: number;
  successfulScrapes: number;
  failedScrapes: number;
  successRate: number;
  uniqueUsers: number;
  totalRecords: number;
  avgRecordsPerScrape: number;
  recentScrapes24h: number;
  recentSuccessRate24h: number;
}

async function scanDynamoDBTable(hoursBack: number = 24): Promise<TripRecord[]> {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - hoursBack);
  const cutoffISOString = cutoffTime.toISOString();

  console.log(`Scanning for records newer than: ${cutoffISOString}`);

  const command = new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: '#timestamp > :cutoff',
    ExpressionAttributeNames: {
      '#timestamp': 'timestamp'
    },
    ExpressionAttributeValues: {
      ':cutoff': cutoffISOString
    }
  });

  const items: TripRecord[] = [];
  let lastEvaluatedKey;

  do {
    if (lastEvaluatedKey) {
      command.input.ExclusiveStartKey = lastEvaluatedKey;
    }

    const response = await docClient.send(command);
    if (response.Items) {
      items.push(...(response.Items as TripRecord[]));
    }
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function calculateMetrics(trips: TripRecord[]): Promise<AnalyticsMetrics> {
  const totalScrapes = trips.length;
  const successfulScrapes = trips.filter(trip => trip.status === 'success').length;
  const failedScrapes = totalScrapes - successfulScrapes;
  const successRate = totalScrapes > 0 ? (successfulScrapes / totalScrapes) * 100 : 0;
  
  const uniqueUsers = new Set(trips.map(trip => trip.userId)).size;
  const totalRecords = trips
    .filter(trip => trip.status === 'success')
    .reduce((sum, trip) => sum + (trip.totalRecords || 0), 0);
  
  const avgRecordsPerScrape = successfulScrapes > 0 ? totalRecords / successfulScrapes : 0;

  // Recent metrics (24 hours)
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
  
  const recentTrips = trips.filter(trip => {
    const tripDate = new Date(trip.timestamp || trip.scrapeDate);
    return tripDate >= twentyFourHoursAgo;
  });

  const recentScrapes24h = recentTrips.length;
  const recentSuccessful = recentTrips.filter(trip => trip.status === 'success').length;
  const recentSuccessRate24h = recentScrapes24h > 0 ? (recentSuccessful / recentScrapes24h) * 100 : 0;

  return {
    totalScrapes,
    successfulScrapes,
    failedScrapes,
    successRate,
    uniqueUsers,
    totalRecords,
    avgRecordsPerScrape,
    recentScrapes24h,
    recentSuccessRate24h
  };
}

async function publishMetrics(metrics: AnalyticsMetrics): Promise<void> {
  const metricData = [
    {
      MetricName: 'TotalScrapes',
      Value: metrics.totalScrapes,
      Unit: StandardUnit.Count,
      Timestamp: new Date()
    },
    {
      MetricName: 'SuccessfulScrapes',
      Value: metrics.successfulScrapes,
      Unit: StandardUnit.Count,
      Timestamp: new Date()
    },
    {
      MetricName: 'FailedScrapes',
      Value: metrics.failedScrapes,
      Unit: StandardUnit.Count,
      Timestamp: new Date()
    },
    {
      MetricName: 'SuccessRate',
      Value: metrics.successRate,
      Unit: StandardUnit.Percent,
      Timestamp: new Date()
    },
    {
      MetricName: 'UniqueUsers',
      Value: metrics.uniqueUsers,
      Unit: StandardUnit.Count,
      Timestamp: new Date()
    },
    {
      MetricName: 'TotalRecords',
      Value: metrics.totalRecords,
      Unit: StandardUnit.Count,
      Timestamp: new Date()
    },
    {
      MetricName: 'AvgRecordsPerScrape',
      Value: metrics.avgRecordsPerScrape,
      Unit: StandardUnit.Count,
      Timestamp: new Date()
    },
    {
      MetricName: 'RecentScrapes24h',
      Value: metrics.recentScrapes24h,
      Unit: StandardUnit.Count,
      Timestamp: new Date()
    },
    {
      MetricName: 'RecentSuccessRate24h',
      Value: metrics.recentSuccessRate24h,
      Unit: StandardUnit.Percent,
      Timestamp: new Date()
    }
  ];

  const command = new PutMetricDataCommand({
    Namespace: METRIC_NAMESPACE,
    MetricData: metricData
  });

  await cloudWatchClient.send(command);
  console.log('Metrics published to CloudWatch');
}

async function checkForAlerts(metrics: AnalyticsMetrics): Promise<void> {
  const alerts: string[] = [];

  // Alert if no scrapes in the last 24 hours
  if (metrics.recentScrapes24h === 0) {
    alerts.push('⚠️ No scrapes detected in the last 24 hours');
  }

  // Alert if success rate is below 50% in the last 24 hours
  if (metrics.recentScrapes24h > 0 && metrics.recentSuccessRate24h < 50) {
    alerts.push(`⚠️ Low success rate in last 24h: ${metrics.recentSuccessRate24h.toFixed(1)}%`);
  }

  // Alert if success rate is below 30% overall
  if (metrics.totalScrapes > 0 && metrics.successRate < 30) {
    alerts.push(`⚠️ Overall success rate is critically low: ${metrics.successRate.toFixed(1)}%`);
  }

  if (alerts.length > 0 && SNS_TOPIC_ARN) {
    const message = `Turo-E-Pass Scraper Alert\n\n${alerts.join('\n')}\n\nMetrics:\n` +
      `- Recent scrapes (24h): ${metrics.recentScrapes24h}\n` +
      `- Recent success rate: ${metrics.recentSuccessRate24h.toFixed(1)}%\n` +
      `- Overall success rate: ${metrics.successRate.toFixed(1)}%\n` +
      `- Total users: ${metrics.uniqueUsers}\n` +
      `- Total records: ${metrics.totalRecords}`;

    const publishCommand = new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: 'Turo-E-Pass Scraper Alert',
      Message: message
    });

    await snsClient.send(publishCommand);
    console.log('Alert sent via SNS');
  }
}

export const handler = async (event: ScheduledEvent, context: Context): Promise<void> => {
  console.log('Analytics Lambda triggered:', JSON.stringify(event, null, 2));
  console.log('Context:', JSON.stringify(context, null, 2));

  try {
    // Scan DynamoDB for recent records
    const trips = await scanDynamoDBTable(168); // 7 days of data for analysis
    console.log(`Found ${trips.length} trip records in the last 7 days`);

    // Calculate metrics
    const metrics = await calculateMetrics(trips);
    console.log('Calculated metrics:', JSON.stringify(metrics, null, 2));

    // Publish metrics to CloudWatch
    await publishMetrics(metrics);

    // Check for alerts
    await checkForAlerts(metrics);

    console.log('Analytics processing completed successfully');
  } catch (error) {
    console.error('Error in analytics processing:', error);
    
    // Send error alert if SNS is configured
    if (SNS_TOPIC_ARN) {
      try {
        const errorMessage = `Analytics Lambda Error\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\nTimestamp: ${new Date().toISOString()}`;
        
        const publishCommand = new PublishCommand({
          TopicArn: SNS_TOPIC_ARN,
          Subject: 'Turo-E-Pass Analytics Error',
          Message: errorMessage
        });

        await snsClient.send(publishCommand);
      } catch (snsError) {
        console.error('Failed to send error alert:', snsError);
      }
    }
    
    throw error;
  }
};