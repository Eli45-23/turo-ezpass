# Turo-EZPass

Automated toll payment system that scrapes Turo trips and pays EZPass tolls automatically. A comprehensive full-stack solution with web dashboard, API, and automated processing workflows.

## 🚀 Features

- **Automated Trip Detection**: Scrapes Turo for new trip data
- **Smart Toll Processing**: Automatically identifies and pays EZPass tolls
- **Web Dashboard**: React-based interface for monitoring and management
- **Real-time Monitoring**: CloudWatch alarms and SNS notifications
- **Secure Authentication**: Cognito-based user management
- **Production-Ready**: Complete AWS infrastructure with SSL and CDN

## 📋 Quick Start

### Prerequisites
- AWS CLI configured
- Node.js 18+
- Terraform 1.0+

### Local Development
```bash
# Clone the repository
git clone <repository-url>
cd turo-ezpass

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start local development
npm run dev
```

### Production Deployment
```bash
# Deploy infrastructure
cd api/terraform
terraform init
terraform plan
terraform apply

# Deploy dashboard
cd ../../dashboard
npm run build
aws s3 sync build/ s3://your-dashboard-bucket --delete
```

## 🏗️ Architecture

- **Frontend**: React dashboard hosted on S3 + CloudFront
- **API**: Node.js Lambda functions with API Gateway
- **Database**: DynamoDB for trip and toll data
- **Authentication**: AWS Cognito user pools
- **Monitoring**: CloudWatch + SNS for alerts
- **Infrastructure**: Fully managed with Terraform

## 📁 Project Structure

```
turo-ezpass/
├── api/terraform/          # Infrastructure as Code
├── dashboard/              # React web application  
├── app/scripts/           # Scraping and processing scripts
├── scripts/               # Deployment and utility scripts
└── docs/                  # Additional documentation
```

## 🛠️ Development

See [CLAUDE.md](./CLAUDE.md) for comprehensive development information including:
- Detailed architecture overview
- Development setup and workflows
- API documentation
- Infrastructure management
- Deployment procedures

## 📖 Documentation

- [CLAUDE.md](./CLAUDE.md) - Comprehensive project guide for developers
- [PRODUCTION_DEPLOYMENT_STATUS.md](./PRODUCTION_DEPLOYMENT_STATUS.md) - Current deployment status
- [API Documentation](./api/README.md) - API endpoints and usage
- [Dashboard Guide](./dashboard/README.md) - Frontend development

## 🚦 Status

**Production**: ✅ Deployed (83 AWS resources managed)
- Lambda functions active
- API Gateway operational  
- S3 + CloudFront configured
- Monitoring and alerts active
- SSL certificate pending DNS validation

## 🔧 Scripts

- `npm run dev` - Start local development
- `npm run build` - Build for production
- `npm run test` - Run test suite
- `npm run deploy` - Deploy to production

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details

---

🤖 Documentation auto-updated with Claude Code
