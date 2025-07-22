# Turo EZPass Backend API

A Node.js/Express backend service for automating toll reimbursement claims for Turo hosts.

## Features

- **Authentication**: AWS Cognito integration with JWT tokens
- **Job Management**: Create, track, and process toll reimbursement jobs
- **Database**: PostgreSQL with automated schema management
- **File Storage**: AWS S3 for proof image storage
- **Event Processing**: EventBridge for job orchestration
- **Scraping**: Automated EZPass and Turo scraping (placeholder implementation)
- **Security**: Input validation, rate limiting, and error handling

## Quick Start

### Prerequisites

- Node.js 18+ 
- PostgreSQL 15+
- AWS Account (for Cognito, S3, EventBridge)
- Docker (optional)

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd app/backend
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

3. **Run with Docker Compose (recommended):**
   ```bash
   docker-compose up -d
   ```

   Or run locally:
   ```bash
   npm run dev
   ```

4. **Access the API:**
   - API: http://localhost:3000
   - Health Check: http://localhost:3000/api/health
   - Database Admin: http://localhost:8080 (pgAdmin)

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh tokens

### Jobs
- `GET /api/jobs` - List user's jobs
- `POST /api/jobs` - Create new job
- `GET /api/jobs/:id` - Get job details
- `PUT /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job

### Submissions
- `POST /api/submit/:jobId` - Submit job for processing

## Environment Variables

Key environment variables (see `.env.example` for full list):

```bash
# Server
NODE_ENV=development
PORT=3000

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# Cognito
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=your_client_id

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=turoezpass
DB_USER=dbadmin
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret_32_chars_minimum
```

## Database Schema

### Users Table
- `id` (UUID, Primary Key)
- `cognito_sub` (String, Unique)
- `email` (String, Unique)
- `name` (String)
- `turo_host_id` (String, Optional)
- `created_at`, `updated_at` (Timestamps)

### Jobs Table
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key)
- `turo_trip_id` (String)
- `status` (Enum: pending, processing, completed, failed, retry)
- `toll_amount` (Decimal)
- `toll_location` (String)
- `trip_start_date`, `trip_end_date` (Timestamps)
- `proof_image_url` (String, Optional)
- `submission_attempts` (Integer)
- `submission_id`, `error_message` (Strings, Optional)
- `created_at`, `updated_at` (Timestamps)

## Project Structure

```
app/backend/
├── config/           # Configuration files
│   ├── aws.js       # AWS services setup
│   ├── cognito.js   # Cognito configuration
│   └── database.js  # Database connection
├── middleware/       # Express middleware
│   ├── auth.js      # Authentication
│   ├── validation.js # Input validation
│   └── errorHandler.js # Error handling
├── models/          # Data models
│   ├── User.js      # User model
│   └── Job.js       # Job model
├── routes/          # API routes
│   ├── auth.js      # Authentication routes
│   ├── jobs.js      # Job management routes
│   └── submit.js    # Job submission routes
├── services/        # Business logic
│   ├── cognitoService.js
│   ├── databaseService.js
│   ├── jobService.js
│   └── awsService.js
├── scripts/         # Utility scripts
│   └── scrapers/    # Web scraping modules
│       ├── ezpass.js
│       ├── turo.js
│       └── index.js
├── server.js        # Application entry point
├── package.json
├── Dockerfile
└── docker-compose.yml
```

## Development

### Available Scripts

```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm run lint       # Run ESLint
npm run test       # Run tests (when implemented)
```

### Docker Development

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down

# Rebuild and start
docker-compose up --build
```

## Important Notes

### Scraping Implementation

The scraping modules (`scripts/scrapers/`) contain **placeholder implementations** only. Actual scraping logic needs to be implemented with consideration for:

- Legal compliance with website terms of service
- Rate limiting and respectful scraping practices
- Error handling and retry logic
- Session management and authentication

### Security Considerations

- All environment variables should be properly secured
- JWT secrets should be strong and unique
- Database credentials should use AWS Secrets Manager in production
- Input validation is implemented but should be reviewed
- Rate limiting is configured but may need adjustment

### AWS Resources Required

This backend expects the following AWS resources (created by Terraform):
- Cognito User Pool and App Client
- S3 Bucket for file storage
- EventBridge for event processing
- Secrets Manager for credential storage
- RDS PostgreSQL instance (for production)

## Deployment

For production deployment:

1. Set `NODE_ENV=production`
2. Use AWS RDS for PostgreSQL
3. Configure proper security groups and VPC
4. Use AWS Secrets Manager for sensitive data
5. Set up proper logging and monitoring
6. Configure auto-scaling and load balancing

## Support

This is a scaffold implementation created for MVP development. Production deployment requires additional security hardening, error handling, and feature implementation.