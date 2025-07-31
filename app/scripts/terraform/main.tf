terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  # Explicit endpoints for DNS resolution issues
  endpoints {
    iam            = "https://iam.amazonaws.com"
    sts            = "https://sts.${var.aws_region}.amazonaws.com"
    secretsmanager = "https://secretsmanager.${var.aws_region}.amazonaws.com"
    ecs            = "https://ecs.${var.aws_region}.amazonaws.com"
    logs           = "https://logs.${var.aws_region}.amazonaws.com"
    sns            = "https://sns.${var.aws_region}.amazonaws.com"
    cloudwatch     = "https://monitoring.${var.aws_region}.amazonaws.com"
    events         = "https://events.${var.aws_region}.amazonaws.com"
    ec2            = "https://ec2.${var.aws_region}.amazonaws.com"
    dynamodb       = "https://dynamodb.${var.aws_region}.amazonaws.com"
  }

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
    }
  }
}

# Secrets Management Module
module "secrets_management" {
  source = "./secrets_management"

  project_name           = var.project_name
  ezpass_secret_name     = "turo-ezpass/ezpass/credentials"
  turo_secret_name       = "turo-ezpass/turo/credentials"
  recovery_window_days   = var.secret_recovery_days
  enable_cloudwatch_logs = var.enable_cloudwatch_logs

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "scraper-automation"
  }
}

# VPC and Networking
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  map_public_ip_on_launch = false # Security best practice - assign IPs explicitly when needed

  tags = {
    Name = "${var.project_name}-public-${count.index + 1}"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

data "aws_availability_zones" "available" {
  state = "available"
}

# Security Group
resource "aws_security_group" "ecs_task" {
  name_prefix = "${var.project_name}-ecs-"
  description = "Security group for ECS tasks to allow outbound internet access"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${var.project_name}-ecs-sg"
  }
}

# Separate egress rules for better security
resource "aws_security_group_rule" "ecs_https_egress" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ecs_task.id
  description       = "Allow HTTPS outbound for API calls"
}

resource "aws_security_group_rule" "ecs_http_egress" {
  type              = "egress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ecs_task.id
  description       = "Allow HTTP outbound for web scraping"
}

resource "aws_security_group_rule" "ecs_dns_egress" {
  type              = "egress"
  from_port         = 53
  to_port           = 53
  protocol          = "udp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ecs_task.id
  description       = "Allow DNS resolution"
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = var.project_name
  }
}

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "ecs_logs" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 365 # Minimum 1 year for compliance
  kms_key_id        = aws_kms_key.logs_key.arn

  tags = {
    Name = var.project_name
  }
}

# KMS key for CloudWatch Logs encryption
resource "aws_kms_key" "logs_key" {
  description             = "KMS key for ${var.project_name} CloudWatch Logs"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::486365525776:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow CloudWatch Logs"
        Effect = "Allow"
        Principal = {
          Service = "logs.${var.aws_region}.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          ArnEquals = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.aws_region}:486365525776:log-group:/ecs/${var.project_name}"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-logs-key"
  }
}

resource "aws_kms_alias" "logs_key_alias" {
  name          = "alias/${var.project_name}-logs"
  target_key_id = aws_kms_key.logs_key.key_id
}

# ECS Task Definition
resource "aws_ecs_task_definition" "scraper" {
  family                   = "${var.project_name}-scraper"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = module.secrets_management.ecs_task_execution_role_arn
  task_role_arn            = module.secrets_management.ecs_task_role_arn

  container_definitions = jsonencode([
    {
      name  = "scraper"
      image = var.docker_image

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs_logs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }

      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "EZPASS_CREDENTIALS_SECRET_NAME"
          value = module.secrets_management.ezpass_secret_name
        },
        {
          name  = "TURO_CREDENTIALS_SECRET_NAME"
          value = module.secrets_management.turo_secret_name
        },
        {
          name  = "DYNAMODB_TABLE_NAME"
          value = aws_dynamodb_table.turo_ezpass_trips.name
        }
      ]

      essential = true
    }
  ])

  tags = {
    Name = var.project_name
  }
}

