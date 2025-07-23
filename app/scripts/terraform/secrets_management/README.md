# Turo-EZPass Secrets Management Module

This Terraform module creates and manages AWS Secrets Manager secrets and IAM permissions for the turo-ezpass scraper application.

## Features

- Creates AWS Secrets Manager secrets for E-ZPass and Turo credentials
- Sets up ECS task execution and runtime IAM roles
- Grants appropriate permissions for secret access
- Optional CloudWatch Logs permissions
- Placeholder secret values (update with real credentials after deployment)

## Usage

### Basic Usage

```hcl
module "turo_ezpass_secrets" {
  source = "./modules/secrets-management"
  
  project_name = "turo-ezpass"
  
  common_tags = {
    Project     = "turo-ezpass"
    Environment = "production"
    Team        = "automation"
  }
}
```

### Advanced Usage

```hcl
module "turo_ezpass_secrets" {
  source = "./modules/secrets-management"
  
  project_name            = "turo-ezpass-prod"
  ezpass_secret_name      = "prod/turo-ezpass/ezpass/credentials"
  turo_secret_name        = "prod/turo-ezpass/turo/credentials"
  recovery_window_days    = 14
  enable_cloudwatch_logs  = true
  
  common_tags = {
    Project     = "turo-ezpass"
    Environment = "production"
    Team        = "automation"
    CostCenter  = "engineering"
  }
}
```

## Outputs

| Name | Description |
|------|-------------|
| `ezpass_secret_arn` | ARN of the E-ZPass credentials secret |
| `turo_secret_arn` | ARN of the Turo credentials secret |
| `ecs_task_execution_role_arn` | ARN of the ECS task execution role |
| `ecs_task_role_arn` | ARN of the ECS task role |
| `container_environment_variables` | Environment variables for ECS container |

## Post-Deployment Steps

After running Terraform, update the secrets with real credentials:

### Using AWS CLI

```bash
# Update E-ZPass credentials
aws secretsmanager update-secret \
  --secret-id turo-ezpass/ezpass/credentials \
  --secret-string '{
    "username": "your-ezpass-username",
    "password": "your-ezpass-password",
    "state": "ny"
  }'

# Update Turo credentials
aws secretsmanager update-secret \
  --secret-id turo-ezpass/turo/credentials \
  --secret-string '{
    "email": "your-turo-email@example.com",
    "password": "your-turo-password"
  }'
```

### Using the provided shell scripts

```bash
# Use the existing scripts from the project
./create-ezpass-secret.sh
./create-turo-secret.sh
```

## ECS Task Definition Integration

Use the outputs in your ECS task definition:

```hcl
resource "aws_ecs_task_definition" "turo_ezpass" {
  family                   = "turo-ezpass-scrapers"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 1024
  memory                   = 2048
  
  execution_role_arn = module.turo_ezpass_secrets.ecs_task_execution_role_arn
  task_role_arn      = module.turo_ezpass_secrets.ecs_task_role_arn
  
  container_definitions = jsonencode([
    {
      name  = "turo-ezpass-scrapers"
      image = "your-ecr-repo/turo-ezpass-scrapers:latest"
      
      environment = [
        for key, value in module.turo_ezpass_secrets.container_environment_variables : {
          name  = key
          value = value
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/turo-ezpass-scrapers"
          awslogs-region        = "us-east-1"
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])
}
```

## AWS CLI Alternative

If you prefer AWS CLI over Terraform:

```bash
# Create E-ZPass secret
aws secretsmanager create-secret \
  --name turo-ezpass/ezpass/credentials \
  --description "E-ZPass NY portal login credentials" \
  --secret-string '{"username":"PLACEHOLDER","password":"PLACEHOLDER","state":"ny"}'

# Create Turo secret
aws secretsmanager create-secret \
  --name turo-ezpass/turo/credentials \
  --description "Turo host dashboard login credentials" \
  --secret-string '{"email":"PLACEHOLDER","password":"PLACEHOLDER"}'

# Create ECS task execution role
aws iam create-role \
  --role-name turo-ezpass-ecs-task-execution-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach managed policy for ECS task execution
aws iam attach-role-policy \
  --role-name turo-ezpass-ecs-task-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Create ECS task role
aws iam create-role \
  --role-name turo-ezpass-ecs-task-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Create and attach secrets access policy
aws iam create-policy \
  --policy-name turo-ezpass-secrets-access \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": [
        "arn:aws:secretsmanager:*:*:secret:turo-ezpass/ezpass/credentials*",
        "arn:aws:secretsmanager:*:*:secret:turo-ezpass/turo/credentials*"
      ]
    }]
  }'

aws iam attach-role-policy \
  --role-name turo-ezpass-ecs-task-role \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/turo-ezpass-secrets-access
```

## Security Considerations

- Secrets are encrypted at rest using AWS managed KMS keys
- IAM policies follow least privilege principle
- Secrets have a 7-day recovery window by default
- Access is restricted to specific ECS tasks via IAM roles

## Requirements

| Name | Version |
|------|---------|
| terraform | >= 1.0 |
| aws | ~> 5.0 |