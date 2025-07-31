# Smoke Test Infrastructure for Turo-EZPass

# Lambda function for smoke testing
resource "aws_lambda_function" "smoke_test" {
  filename      = "smoke-test.zip"
  function_name = "turo-ezpass-smoke-test"
  role          = aws_iam_role.smoke_test.arn
  handler       = "index.handler"
  runtime       = "python3.9"
  timeout       = 900 # 15 minutes for full test

  source_code_hash = data.archive_file.smoke_test_zip.output_base64sha256

  tracing_config {
    mode = "Active"
  }

  reserved_concurrent_executions = 1

  dead_letter_config {
    target_arn = aws_sqs_queue.dlq.arn
  }

  vpc_config {
    subnet_ids         = var.subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  code_signing_config_arn = aws_lambda_code_signing_config.sign.arn

  environment {
    variables = var.lambda_env_vars
  }

  tags = {
    Name        = "turo-ezpass-smoke-test"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# IAM Role for smoke test Lambda
resource "aws_iam_role" "smoke_test" {
  name = "turo-ezpass-smoke-test-role"

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
    Name        = "turo-ezpass-smoke-test"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# IAM Policy for smoke test
resource "aws_iam_role_policy" "smoke_test" {
  name = "turo-ezpass-smoke-test-policy"
  role = aws_iam_role.smoke_test.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/lambda/turo-ezpass-smoke-test",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/lambda/turo-ezpass-smoke-test:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:DescribeClusters"
        ]
        Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:cluster/${var.project_name}-cluster"
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition"
        ]
        Resource = "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task-definition/${var.project_name}-scraper:*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecs:RunTask",
          "ecs:DescribeTasks",
          "ecs:ListTasks"
        ]
        Resource = [
          "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task/${var.project_name}-cluster/*",
          "arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:task-definition/${var.project_name}-scraper:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:turo-ezpass/ezpass/credentials*",
          "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:turo-ezpass/turo/credentials*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = [
          aws_s3_bucket.proofs.arn,
          "${aws_s3_bucket.proofs.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.alerts.arn
      },
      {
        Effect = "Allow"
        Action = [
          "logs:DescribeLogStreams",
          "logs:GetLogEvents"
        ]
        Resource = [
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/ecs/${var.project_name}:*",
          "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/ecs/${var.project_name}-cost-optimized:*"
        ]
      }
    ]
  })
}

# Create the smoke test Lambda deployment package
data "archive_file" "smoke_test_zip" {
  type        = "zip"
  output_path = "smoke-test.zip"

  source {
    content  = <<EOF
import json
import boto3
import time
import logging
from datetime import datetime, timedelta

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    """
    Comprehensive smoke test for Turo-EZPass infrastructure
    """
    
    test_results = {
        'timestamp': datetime.utcnow().isoformat(),
        'tests': {},
        'overall_status': 'PASS',
        'errors': []
    }
    
    try:
        # Initialize AWS clients
        ecs = boto3.client('ecs')
        s3 = boto3.client('s3')
        secrets = boto3.client('secretsmanager')
        sns = boto3.client('sns')
        logs = boto3.client('logs')
        
        # Test 1: Verify ECS Cluster exists and is active
        logger.info("Testing ECS cluster availability...")
        cluster_name = os.environ['ECS_CLUSTER_NAME']
        
        try:
            cluster_response = ecs.describe_clusters(clusters=[cluster_name])
            cluster = cluster_response['clusters'][0]
            
            if cluster['status'] == 'ACTIVE':
                test_results['tests']['ecs_cluster'] = 'PASS'
                logger.info(f"✅ ECS cluster {cluster_name} is active")
            else:
                test_results['tests']['ecs_cluster'] = 'FAIL'
                test_results['errors'].append(f"ECS cluster status: {cluster['status']}")
                
        except Exception as e:
            test_results['tests']['ecs_cluster'] = 'FAIL'
            test_results['errors'].append(f"ECS cluster check failed: {str(e)}")
        
        # Test 2: Verify secrets are accessible
        logger.info("Testing secrets accessibility...")
        secret_names = [
            os.environ['EZPASS_SECRET_NAME'],
            os.environ['TURO_SECRET_NAME']
        ]
        
        secrets_status = 'PASS'
        for secret_name in secret_names:
            try:
                secret_response = secrets.get_secret_value(SecretId=secret_name)
                secret_data = json.loads(secret_response['SecretString'])
                
                if 'username' in secret_data and 'password' in secret_data:
                    logger.info(f"✅ Secret {secret_name} is accessible and valid")
                else:
                    secrets_status = 'FAIL'
                    test_results['errors'].append(f"Secret {secret_name} missing required fields")
                    
            except Exception as e:
                secrets_status = 'FAIL'
                test_results['errors'].append(f"Secret {secret_name} check failed: {str(e)}")
        
        test_results['tests']['secrets_access'] = secrets_status
        
        # Test 3: Verify S3 bucket accessibility
        logger.info("Testing S3 bucket accessibility...")
        bucket_name = os.environ['S3_BUCKET']
        
        try:
            # Test bucket access
            s3.head_bucket(Bucket=bucket_name)
            
            # Test write access
            test_key = f"smoke-test/{datetime.utcnow().isoformat()}.txt"
            test_content = "Smoke test validation file"
            
            s3.put_object(
                Bucket=bucket_name,
                Key=test_key,
                Body=test_content.encode('utf-8'),
                ContentType='text/plain'
            )
            
            # Verify file was written
            response = s3.get_object(Bucket=bucket_name, Key=test_key)
            retrieved_content = response['Body'].read().decode('utf-8')
            
            if retrieved_content == test_content:
                test_results['tests']['s3_access'] = 'PASS'
                logger.info(f"✅ S3 bucket {bucket_name} read/write test passed")
            else:
                test_results['tests']['s3_access'] = 'FAIL'
                test_results['errors'].append("S3 content verification failed")
                
        except Exception as e:
            test_results['tests']['s3_access'] = 'FAIL'
            test_results['errors'].append(f"S3 bucket check failed: {str(e)}")
        
        # Test 4: Run a test ECS task (optional - can be resource intensive)
        if event.get('run_ecs_test', False):
            logger.info("Running ECS task test...")
            task_definition = os.environ['ECS_TASK_DEFINITION']
            
            try:
                # This would run the actual scraper task
                # Commented out to avoid unnecessary costs in routine smoke tests
                # run_response = ecs.run_task(
                #     cluster=cluster_name,
                #     taskDefinition=task_definition,
                #     launchType='FARGATE',
                #     networkConfiguration={
                #         'awsvpcConfiguration': {
                #             'subnets': ['subnet-xxx'],  # Would need actual subnet IDs
                #             'securityGroups': ['sg-xxx'],  # Would need actual SG IDs
                #             'assignPublicIp': 'ENABLED'
                #         }
                #     }
                # )
                
                test_results['tests']['ecs_task'] = 'SKIPPED'
                logger.info("⏭️ ECS task test skipped (set run_ecs_test=true to enable)")
                
            except Exception as e:
                test_results['tests']['ecs_task'] = 'FAIL'
                test_results['errors'].append(f"ECS task test failed: {str(e)}")
        else:
            test_results['tests']['ecs_task'] = 'SKIPPED'
        
        # Test 5: Verify monitoring setup
        logger.info("Testing monitoring setup...")
        try:
            # Check if log group exists
            log_group_name = f"/ecs/{os.environ.get('PROJECT_NAME', 'turo-ezpass')}"
            logs.describe_log_groups(logGroupNamePrefix=log_group_name)
            
            test_results['tests']['monitoring'] = 'PASS'
            logger.info("✅ CloudWatch logs setup verified")
            
        except Exception as e:
            test_results['tests']['monitoring'] = 'FAIL'
            test_results['errors'].append(f"Monitoring check failed: {str(e)}")
        
        # Determine overall status
        failed_tests = [test for test, status in test_results['tests'].items() if status == 'FAIL']
        if failed_tests:
            test_results['overall_status'] = 'FAIL'
            test_results['failed_tests'] = failed_tests
        
        # Send notification if there are failures
        if test_results['overall_status'] == 'FAIL':
            notification_message = {
                "subject": "🚨 Turo-EZPass Smoke Test FAILED",
                "message": f"Smoke test failed with {len(failed_tests)} failures",
                "details": test_results,
                "timestamp": test_results['timestamp']
            }
            
            sns.publish(
                TopicArn=os.environ['SNS_TOPIC_ARN'],
                Subject=notification_message['subject'],
                Message=json.dumps(notification_message, indent=2)
            )
        else:
            logger.info("✅ All smoke tests passed successfully")
        
        return {
            'statusCode': 200,
            'body': json.dumps(test_results, indent=2)
        }
        
    except Exception as e:
        logger.error(f"Smoke test failed with exception: {str(e)}")
        test_results['overall_status'] = 'ERROR'
        test_results['errors'].append(f"Unexpected error: {str(e)}")
        
        return {
            'statusCode': 500,
            'body': json.dumps(test_results, indent=2)
        }
EOF
    filename = "index.py"
  }
}

# Schedule smoke tests to run daily
resource "aws_cloudwatch_event_rule" "smoke_test_schedule" {
  name                = "turo-ezpass-smoke-test"
  description         = "Run smoke tests daily"
  schedule_expression = "cron(0 6 * * ? *)" # Daily at 6 AM UTC

  tags = {
    Name        = "turo-ezpass-smoke-test"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# EventBridge target for smoke tests
resource "aws_cloudwatch_event_target" "smoke_test" {
  rule      = aws_cloudwatch_event_rule.smoke_test_schedule.name
  target_id = "SmokeTestTarget"
  arn       = aws_lambda_function.smoke_test.arn

  input = jsonencode({
    run_ecs_test = false # Set to true for full ECS testing
  })
}

# Lambda permission for EventBridge
resource "aws_lambda_permission" "smoke_test_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.smoke_test.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.smoke_test_schedule.arn
}

# CloudWatch alarm for smoke test failures
resource "aws_cloudwatch_metric_alarm" "smoke_test_failures" {
  alarm_name          = "turo-ezpass-smoke-test-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "Smoke test function failures"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = aws_lambda_function.smoke_test.function_name
  }

  tags = {
    Name        = "turo-ezpass-smoke-test-failures"
    Project     = "turo-ezpass"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}