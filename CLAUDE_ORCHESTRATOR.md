# Orchestrator for Turo-EzPass Project

This file is your centralized command center to drive all Claude agents for the turo-ezpass project.  

## Project Overview
The Turo-EzPass system automates toll submission for Turo hosts by:
1. Scraping E-ZPass accounts for toll charges
2. Matching tolls to Turo trips based on time/location
3. Automatically submitting reimbursement claims via Turo's host interface
4. Providing a mobile app for hosts to track and manage submissions

## Current Project State
- ✅ **Infrastructure**: Complete Terraform setup (VPC, RDS, Cognito, S3, EventBridge, Secrets Manager)
- ✅ **iOS App**: Full SwiftUI app with authentication, dashboard, job management, and retry functionality
- 🔄 **Backend**: Not yet implemented (Express.js APIs needed)
- 🔄 **Scraping**: Research and implementation needed for E-ZPass portals
- 🔄 **Turo Integration**: Research needed for host interface automation

## Available Agents

### `@Infra-Agent` - Infrastructure & DevOps
**Specializes in**: AWS infrastructure, Terraform, CI/CD, monitoring, security
**Current Status**: Complete infrastructure deployed
**Use for**: Infrastructure updates, security improvements, monitoring setup, cost optimization

### `@Backend-Agent` - API Development  
**Specializes in**: Express.js, Node.js, database design, API architecture, authentication
**Current Status**: Not yet implemented
**Use for**: REST APIs, database schemas, authentication flows, business logic

### `@iOS-Agent` - Mobile Development
**Specializes in**: SwiftUI, iOS development, MVVM architecture, Combine, UI/UX
**Current Status**: Complete iOS app with authentication and job management
**Use for**: iOS app enhancements, new features, UI improvements, App Store preparation

### `@E-Pass-Research-Agent` - E-ZPass Analysis
**Specializes in**: E-ZPass portal analysis, web scraping research, authentication flows
**Current Status**: Research needed
**Use for**: Portal reconnaissance, scraping strategy, selector mapping, API reverse engineering

### `@Turo-Research-Agent` - Turo Integration Analysis  
**Specializes in**: Turo host interface analysis, trip data extraction, submission workflows
**Current Status**: Research needed
**Use for**: Turo API analysis, host dashboard scraping, trip matching logic, submission automation

### `@Scraper-Agent` - Web Automation
**Specializes in**: Puppeteer, Playwright, web scraping, bot detection evasion, data extraction
**Current Status**: Implementation needed
**Use for**: E-ZPass scraping implementation, Turo automation, data extraction pipelines

### `@TuroTrip-Agent` - Trip Matching Logic
**Specializes in**: Algorithm development, trip-toll matching, geolocation, time-based correlation
**Current Status**: Logic design needed  
**Use for**: Matching algorithms, trip analysis, location correlation, confidence scoring

### `@TuroBot-Agent` - Submission Automation
**Specializes in**: Turo host interface automation, form submission, claim processing
**Current Status**: Implementation needed
**Use for**: Automated claim submission, form filling, status tracking, error handling

## Usage Examples

### Infrastructure Management
```
@Infra-Agent:
Add CloudWatch monitoring and alerting for the Lambda functions. Include metrics for:
- Toll scraping success/failure rates  
- API response times
- Database connection health
- S3 storage usage
Create SNS topics for critical alerts.
```

### Infrastructure Provisioning
```
@Infra-Agent:
Generate Terraform HCL (with comments) that will:
1. Create a VPC with one public and one private subnet in us-east-1.
2. Provision an encrypted Amazon RDS PostgreSQL instance.
3. Set up a Cognito User Pool for host authentication.
4. Create an S3 bucket for screenshots and logs.
5. Define an EventBridge rule to trigger a Lambda daily at 2 AM UTC.
6. Store DB credentials and OAuth secrets in AWS Secrets Manager.

Output three files under `/infra/`:
- `main.tf`
- `variables.tf`
- `outputs.tf`

Then commit the updated `CLAUDE_ORCHESTRATOR.md` to the `main` branch.
```

### Backend Development
```
@Backend-Agent:
Scaffold Express.js application with the following routes:
- POST /auth/login - Cognito authentication
- GET /jobs - Fetch toll submission jobs with filtering
- POST /jobs/{id}/submit - Submit toll claim to Turo
- GET /trips - Fetch Turo trip data
- POST /tolls/scrape - Trigger E-ZPass scraping
Include middleware for authentication, validation, and error handling.
```

### iOS Enhancements  
```
@iOS-Agent:
Add push notifications support for:
- Successful toll submissions
- Failed submission alerts  
- New tolls detected
Include notification settings in the profile screen and proper permission handling.
```

### E-ZPass Research
```
@E-Pass-Research-Agent:
Deep-dive into E-ZPass NY portal (https://www.e-zpassny.com) and document:
1. Login flow and required form fields
2. Toll history page structure and selectors
3. Date range filtering options
4. Pagination handling
5. Anti-bot measures and rate limiting
6. Export/download capabilities
Create a comprehensive scraping strategy document.
```

### Turo Research
```
@Turo-Research-Agent:  
Investigate Turo host "Trips" UI and map out:
1. Trip listing page structure and data fields
2. Individual trip detail pages
3. "Charge incidents" or reimbursement flow
4. Required authentication and session management
5. Form submission endpoints for toll claims
Document the complete host dashboard workflow.
```

### Scraping Implementation
```
@Scraper-Agent:
Implement E-ZPass scraper using Puppeteer with:
- Stealth mode configuration to avoid detection
- Cookie and session management
- Robust error handling and retries
- Data extraction and JSON output
- Support for multiple E-ZPass networks (NY, NJ, PA, etc.)
```

### Trip Matching Logic
```
@TuroTrip-Agent:
Design and implement toll-to-trip matching algorithm considering:
- Geographic proximity (toll location vs trip route)
- Time correlation (toll timestamp vs trip duration)
- Vehicle/transponder mapping
- Confidence scoring (high/medium/low matches)
- Manual override capabilities for edge cases
```

### Submission Automation
```
@TuroBot-Agent:
Create Turo host interface automation to:
- Navigate to incident reporting/reimbursement section
- Fill out toll reimbursement forms automatically
- Upload proof images from S3
- Handle form validation and submission
- Track submission status and confirmation numbers
```

## Multi-Agent Workflows

### Complete Feature Development
```
@Backend-Agent: Create /api/scrape endpoint
@E-Pass-Research-Agent: Research target portal structure  
@Scraper-Agent: Implement scraping logic
@TuroTrip-Agent: Add trip matching to endpoint
@iOS-Agent: Add manual scrape trigger button
```

### Production Deployment
```
@Infra-Agent: Set up production environment and CI/CD
@Backend-Agent: Add health checks and monitoring endpoints
@iOS-Agent: Configure production API endpoints and App Store build
@Scraper-Agent: Implement production-ready error handling and logging
```

### Research Phase
```
@E-Pass-Research-Agent: Document E-ZPass portal capabilities
@Turo-Research-Agent: Map Turo host interface workflows  
@TuroTrip-Agent: Design matching algorithm based on research findings
@Scraper-Agent: Plan implementation strategy from research
```

## Best Practices

1. **Always specify context**: Include relevant files, current state, and dependencies
2. **Be specific**: Provide exact requirements, endpoints, and expected outputs  
3. **Consider integration**: Ensure agents work together seamlessly
4. **Include testing**: Ask for test coverage and validation strategies
5. **Document everything**: Maintain clear documentation for future development

## Project Structure
```
turo-ezpass/
├── infra/                 # Terraform infrastructure (✅ Complete)
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
├── app/
│   └── ios/              # iOS SwiftUI app (✅ Complete)
│       └── TuroTollHost/
├── backend/              # Express.js API (🔄 Needed)
├── scrapers/             # E-ZPass scrapers (🔄 Needed)  
├── docs/                 # Research documentation (🔄 Needed)
└── CLAUDE_ORCHESTRATOR.md
```

---

To invoke an agent, start a block with its tag followed by a colon, then your detailed instructions. The agent will have access to the full project context and current state.