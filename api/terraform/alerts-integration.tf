# Advanced Alerting and On-Call Integration for Turo-EZPass

# Variables for integration configuration
variable "slack_webhook_url" {
  description = "Slack webhook URL for notifications"
  type        = string
  default     = ""
  sensitive   = true
}

variable "pagerduty_integration_key" {
  description = "PagerDuty integration key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "teams_webhook_url" {
  description = "Microsoft Teams webhook URL for notifications"
  type        = string
  default     = ""
  sensitive   = true
}

variable "alert_severity_levels" {
  description = "Configuration for different alert severity levels"
  type = map(object({
    slack_channel     = string
    pagerduty_enabled = bool
    email_enabled     = bool
    escalation_delay  = number
  }))
  default = {
    critical = {
      slack_channel     = "#alerts-critical"
      pagerduty_enabled = true
      email_enabled     = true
      escalation_delay  = 300  # 5 minutes
    }
    warning = {
      slack_channel     = "#alerts-warning"
      pagerduty_enabled = false
      email_enabled     = true
      escalation_delay  = 900  # 15 minutes
    }
    info = {
      slack_channel     = "#alerts-info"
      pagerduty_enabled = false
      email_enabled     = false
      escalation_delay  = 0
    }
  }
}

# Lambda function for Slack notifications
resource "aws_lambda_function" "slack_notifier" {
  count = var.slack_webhook_url != "" ? 1 : 0
  
  filename         = data.archive_file.slack_notifier_zip[0].output_path
  function_name    = "${var.project_name}-${var.environment}-slack-notifier"
  role            = aws_iam_role.slack_notifier_role[0].arn
  handler         = "index.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  memory_size     = 128

  source_code_hash = data.archive_file.slack_notifier_zip[0].output_base64sha256

  environment {
    variables = {
      SLACK_WEBHOOK_URL = var.slack_webhook_url
      PROJECT_NAME      = var.project_name
      ENVIRONMENT       = var.environment
    }
  }

  tags = {
    Name        = "${var.project_name}-slack-notifier"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Create Slack notifier Lambda code
resource "local_file" "slack_notifier_code" {
  count = var.slack_webhook_url != "" ? 1 : 0
  
  filename = "/tmp/slack-notifier-${var.project_name}-${var.environment}.js"
  content = <<EOF
const https = require('https');
const url = require('url');

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    const projectName = process.env.PROJECT_NAME;
    const environment = process.env.ENVIRONMENT;
    
    if (!webhookUrl) {
        console.error('SLACK_WEBHOOK_URL not configured');
        return { statusCode: 400, body: 'Webhook URL not configured' };
    }
    
    // Parse SNS message
    let message, subject, timestamp;
    
    if (event.Records && event.Records[0].Sns) {
        const sns = event.Records[0].Sns;
        message = sns.Message;
        subject = sns.Subject;
        timestamp = sns.Timestamp;
    } else {
        message = event.message || JSON.stringify(event);
        subject = event.subject || 'Alert';
        timestamp = new Date().toISOString();
    }
    
    // Determine alert severity and formatting
    let color = '#36a64f'; // green
    let emoji = '📊';
    let priority = 'Info';
    
    if (subject.toLowerCase().includes('alarm') || message.toLowerCase().includes('alarm')) {
        if (message.toLowerCase().includes('critical') || subject.toLowerCase().includes('critical')) {
            color = '#ff0000'; // red
            emoji = '🚨';
            priority = 'Critical';
        } else {
            color = '#ff9900'; // orange
            emoji = '⚠️';
            priority = 'Warning';
        }
    }
    
    // Parse CloudWatch alarm details if present
    let alarmDetails = {};
    try {
        const parsed = JSON.parse(message);
        if (parsed.AlarmName) {
            alarmDetails = {
                alarmName: parsed.AlarmName,
                alarmDescription: parsed.AlarmDescription,
                newState: parsed.NewStateValue,
                oldState: parsed.OldStateValue,
                reason: parsed.NewStateReason,
                region: parsed.Region,
                timestamp: parsed.StateChangeTime
            };
        }
    } catch (e) {
        // Not a CloudWatch alarm, continue with basic formatting
    }
    
    // Create Slack message payload
    const slackPayload = {
        username: `$${projectName}-$${environment}`,
        icon_emoji: emoji,
        attachments: [{
            color: color,
            title: `$${emoji} $${subject}`,
            text: alarmDetails.alarmName ? 
                `*Alarm:* $${alarmDetails.alarmName}\n*State:* $${alarmDetails.oldState} → $${alarmDetails.newState}\n*Reason:* $${alarmDetails.reason}` :
                message,
            fields: [
                {
                    title: 'Environment',
                    value: environment,
                    short: true
                },
                {
                    title: 'Priority',
                    value: priority,
                    short: true
                },
                {
                    title: 'Timestamp',
                    value: timestamp,
                    short: false
                }
            ],
            footer: `$${projectName} Monitoring`,
            ts: Math.floor(Date.now() / 1000)
        }]
    };
    
    // Add action buttons for critical alerts
    if (priority === 'Critical') {
        slackPayload.attachments[0].actions = [
            {
                type: 'button',
                text: 'View CloudWatch',
                url: `https://console.aws.amazon.com/cloudwatch/home?region=$${alarmDetails.region || "us-east-1"}#alarmsV2:`,
                style: 'primary'
            },
            {
                type: 'button',
                text: 'View Logs',
                url: `https://console.aws.amazon.com/cloudwatch/home?region=$${alarmDetails.region || "us-east-1"}#logsV2:logs-insights`,
                style: 'default'
            }
        ];
    }
    
    // Send to Slack
    return new Promise((resolve, reject) => {
        const urlParts = url.parse(webhookUrl);
        const postData = JSON.stringify(slackPayload);
        
        const options = {
            hostname: urlParts.hostname,
            port: 443,
            path: urlParts.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('Slack notification sent successfully');
                    resolve({ statusCode: 200, body: 'Notification sent' });
                } else {
                    console.error('Slack notification failed:', res.statusCode, data);
                    reject(new Error(`Slack API error: $${res.statusCode}`));
                }
            });
        });
        
        req.on('error', (error) => {
            console.error('Request error:', error);
            reject(error);
        });
        
        req.write(postData);
        req.end();
    });
};
EOF
}

# Archive Slack notifier Lambda code
data "archive_file" "slack_notifier_zip" {
  count = var.slack_webhook_url != "" ? 1 : 0
  
  type        = "zip"
  output_path = "/tmp/slack-notifier-${var.project_name}-${var.environment}.zip"
  
  source {
    content  = local_file.slack_notifier_code[0].content
    filename = "index.js"
  }
}

# IAM role for Slack notifier Lambda
resource "aws_iam_role" "slack_notifier_role" {
  count = var.slack_webhook_url != "" ? 1 : 0
  
  name = "${var.project_name}-${var.environment}-slack-notifier-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-slack-notifier-role"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Attach basic execution policy to Slack notifier role
resource "aws_iam_role_policy_attachment" "slack_notifier_basic_policy" {
  count = var.slack_webhook_url != "" ? 1 : 0
  
  role       = aws_iam_role.slack_notifier_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda function for PagerDuty notifications
resource "aws_lambda_function" "pagerduty_notifier" {
  count = var.pagerduty_integration_key != "" ? 1 : 0
  
  filename         = data.archive_file.pagerduty_notifier_zip[0].output_path
  function_name    = "${var.project_name}-${var.environment}-pagerduty-notifier"
  role            = aws_iam_role.pagerduty_notifier_role[0].arn
  handler         = "index.handler"
  runtime         = "nodejs18.x"
  timeout         = 30
  memory_size     = 128

  source_code_hash = data.archive_file.pagerduty_notifier_zip[0].output_base64sha256

  environment {
    variables = {
      PAGERDUTY_INTEGRATION_KEY = var.pagerduty_integration_key
      PROJECT_NAME              = var.project_name
      ENVIRONMENT               = var.environment
    }
  }

  tags = {
    Name        = "${var.project_name}-pagerduty-notifier"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Create PagerDuty notifier Lambda code
resource "local_file" "pagerduty_notifier_code" {
  count = var.pagerduty_integration_key != "" ? 1 : 0
  
  filename = "/tmp/pagerduty-notifier-${var.project_name}-${var.environment}.js"
  content = <<EOF
const https = require('https');

exports.handler = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    const integrationKey = process.env.PAGERDUTY_INTEGRATION_KEY;
    const projectName = process.env.PROJECT_NAME;
    const environment = process.env.ENVIRONMENT;
    
    if (!integrationKey) {
        console.error('PAGERDUTY_INTEGRATION_KEY not configured');
        return { statusCode: 400, body: 'Integration key not configured' };
    }
    
    // Parse SNS message
    let message, subject, timestamp;
    
    if (event.Records && event.Records[0].Sns) {
        const sns = event.Records[0].Sns;
        message = sns.Message;
        subject = sns.Subject;
        timestamp = sns.Timestamp;
    } else {
        message = event.message || JSON.stringify(event);
        subject = event.subject || 'Alert';
        timestamp = new Date().toISOString();
    }
    
    // Parse CloudWatch alarm details
    let alarmDetails = {};
    let severity = 'warning';
    let eventAction = 'trigger';
    
    try {
        const parsed = JSON.parse(message);
        if (parsed.AlarmName) {
            alarmDetails = parsed;
            
            // Determine severity and action based on alarm state
            if (parsed.NewStateValue === 'ALARM') {
                severity = parsed.AlarmName.toLowerCase().includes('critical') ? 'critical' : 'warning';
                eventAction = 'trigger';
            } else if (parsed.NewStateValue === 'OK') {
                eventAction = 'resolve';
            }
        }
    } catch (e) {
        // Not a CloudWatch alarm, treat as generic alert
    }
    
    // Create PagerDuty event payload
    const pdPayload = {
        routing_key: integrationKey,
        event_action: eventAction,
        dedup_key: `$${projectName}-$${environment}-$${alarmDetails.AlarmName || "generic"}-$${Date.now()}`,
        payload: {
            summary: `$${projectName} $${environment}: $${subject}`,
            severity: severity,
            source: `$${projectName}-$${environment}`,
            component: alarmDetails.AlarmName || 'system',
            group: projectName,
            class: 'infrastructure',
            custom_details: {
                environment: environment,
                project: projectName,
                alarm_name: alarmDetails.AlarmName,
                alarm_description: alarmDetails.AlarmDescription,
                new_state: alarmDetails.NewStateValue,
                old_state: alarmDetails.OldStateValue,
                reason: alarmDetails.NewStateReason,
                region: alarmDetails.Region,
                timestamp: timestamp,
                raw_message: message
            }
        },
        links: [
            {
                href: `https://console.aws.amazon.com/cloudwatch/home?region=$${alarmDetails.Region || "us-east-1"}#alarmsV2:`,
                text: 'View in CloudWatch'
            }
        ]
    };
    
    // Send to PagerDuty
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(pdPayload);
        
        const options = {
            hostname: 'events.pagerduty.com',
            port: 443,
            path: '/v2/enqueue',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const response = JSON.parse(data);
                if (res.statusCode === 202) {
                    console.log('PagerDuty event sent successfully:', response.dedup_key);
                    resolve({ statusCode: 200, body: JSON.stringify(response) });
                } else {
                    console.error('PagerDuty event failed:', res.statusCode, data);
                    reject(new Error(`PagerDuty API error: $${res.statusCode}`));
                }
            });
        });
        
        req.on('error', (error) => {
            console.error('Request error:', error);
            reject(error);
        });
        
        req.write(postData);
        req.end();
    });
};
EOF
}

# Archive PagerDuty notifier Lambda code
data "archive_file" "pagerduty_notifier_zip" {
  count = var.pagerduty_integration_key != "" ? 1 : 0
  
  type        = "zip"
  output_path = "/tmp/pagerduty-notifier-${var.project_name}-${var.environment}.zip"
  
  source {
    content  = local_file.pagerduty_notifier_code[0].content
    filename = "index.js"
  }
}

# IAM role for PagerDuty notifier Lambda
resource "aws_iam_role" "pagerduty_notifier_role" {
  count = var.pagerduty_integration_key != "" ? 1 : 0
  
  name = "${var.project_name}-${var.environment}-pagerduty-notifier-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-pagerduty-notifier-role"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Attach basic execution policy to PagerDuty notifier role
resource "aws_iam_role_policy_attachment" "pagerduty_notifier_basic_policy" {
  count = var.pagerduty_integration_key != "" ? 1 : 0
  
  role       = aws_iam_role.pagerduty_notifier_role[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# SNS topic subscriptions for integrations
resource "aws_sns_topic_subscription" "slack_alerts" {
  count = var.slack_webhook_url != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_notifier[0].arn
}

resource "aws_sns_topic_subscription" "pagerduty_alerts" {
  count = var.pagerduty_integration_key != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.pagerduty_notifier[0].arn
}

# Lambda permissions for SNS
resource "aws_lambda_permission" "sns_invoke_slack" {
  count = var.slack_webhook_url != "" ? 1 : 0
  
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.slack_notifier[0].function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alerts.arn
}

resource "aws_lambda_permission" "sns_invoke_pagerduty" {
  count = var.pagerduty_integration_key != "" ? 1 : 0
  
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pagerduty_notifier[0].function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alerts.arn
}

# Enhanced CloudWatch alarms with different SNS topics for different severities
resource "aws_sns_topic" "critical_alerts" {
  name = "${var.project_name}-${var.environment}-critical-alerts"

  tags = {
    Name        = "${var.project_name}-critical-alerts"
    Project     = var.project_name
    Environment = var.environment
    Severity    = "critical"
  }
}

resource "aws_sns_topic" "warning_alerts" {
  name = "${var.project_name}-${var.environment}-warning-alerts"

  tags = {
    Name        = "${var.project_name}-warning-alerts"
    Project     = var.project_name
    Environment = var.environment
    Severity    = "warning"
  }
}

# Critical alert subscriptions (email + Slack + PagerDuty)
resource "aws_sns_topic_subscription" "critical_email" {
  count = var.alert_email != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.critical_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_sns_topic_subscription" "critical_slack" {
  count = var.slack_webhook_url != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.critical_alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_notifier[0].arn
}

resource "aws_sns_topic_subscription" "critical_pagerduty" {
  count = var.pagerduty_integration_key != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.critical_alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.pagerduty_notifier[0].arn
}

# Warning alert subscriptions (email + Slack only)
resource "aws_sns_topic_subscription" "warning_email" {
  count = var.alert_email != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.warning_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_sns_topic_subscription" "warning_slack" {
  count = var.slack_webhook_url != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.warning_alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_notifier[0].arn
}

# Update existing alarms to use severity-specific topics
resource "aws_cloudwatch_metric_alarm" "critical_no_recent_scrapes" {
  alarm_name          = "${var.project_name}-${var.environment}-critical-no-recent-scrapes"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "RecentScrapes24h"
  namespace           = "TuroEZPass"
  period              = "3600"
  statistic           = "Maximum"
  threshold           = "1"
  alarm_description   = "CRITICAL: No scrapes detected in the last 24 hours - system may be down"
  alarm_actions       = [aws_sns_topic.critical_alerts.arn]
  ok_actions          = [aws_sns_topic.critical_alerts.arn]
  treat_missing_data  = "breaching"

  tags = {
    Name        = "${var.project_name}-critical-no-recent-scrapes"
    Project     = var.project_name
    Environment = var.environment
    Severity    = "critical"
  }
}

resource "aws_cloudwatch_metric_alarm" "warning_low_success_rate" {
  alarm_name          = "${var.project_name}-${var.environment}-warning-low-success-rate"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "RecentSuccessRate24h"
  namespace           = "TuroEZPass"
  period              = "3600"
  statistic           = "Average"
  threshold           = "50"
  alarm_description   = "WARNING: Success rate below 50% in the last 24 hours"
  alarm_actions       = [aws_sns_topic.warning_alerts.arn]
  ok_actions          = [aws_sns_topic.warning_alerts.arn]
  treat_missing_data  = "notBreaching"

  tags = {
    Name        = "${var.project_name}-warning-low-success-rate"
    Project     = var.project_name
    Environment = var.environment
    Severity    = "warning"
  }
}

# Outputs for integration configuration
output "integration_endpoints" {
  description = "Integration endpoints and configuration"
  sensitive   = true
  value = {
    slack_lambda_arn     = var.slack_webhook_url != "" ? aws_lambda_function.slack_notifier[0].arn : null
    pagerduty_lambda_arn = var.pagerduty_integration_key != "" ? aws_lambda_function.pagerduty_notifier[0].arn : null
    critical_alerts_topic = aws_sns_topic.critical_alerts.arn
    warning_alerts_topic  = aws_sns_topic.warning_alerts.arn
    slack_configured     = var.slack_webhook_url != ""
    pagerduty_configured = var.pagerduty_integration_key != ""
  }
}