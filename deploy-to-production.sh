#!/bin/bash

# Deploy Turo Toll Tracker to Production
# This script helps you deploy your app to Render.com with turoezpass.com domain

set -e  # Exit on any error

echo "🚀 Turo Toll Tracker - Production Deployment Script"
echo "==============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
print_status "Checking prerequisites..."

if ! command -v git &> /dev/null; then
    print_error "Git is required but not installed"
    exit 1
fi

if ! command -v node &> /dev/null; then
    print_error "Node.js is required but not installed"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    print_error "npm is required but not installed"
    exit 1
fi

print_success "All prerequisites met"

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "server.js" ]; then
    print_error "This script must be run from the turo-tolls project directory"
    exit 1
fi

# Check git status
print_status "Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
    print_warning "You have uncommitted changes. Let's commit them first."
    echo ""
    git status --short
    echo ""
    read -p "Enter commit message (or press Enter for default): " commit_message
    if [ -z "$commit_message" ]; then
        commit_message="Prepare for production deployment"
    fi
    
    git add .
    git commit -m "$commit_message"
    print_success "Changes committed"
fi

# Push to GitHub
print_status "Pushing to GitHub..."
git push origin main
print_success "Code pushed to GitHub"

# Generate secure secrets
print_status "Generating secure environment variables..."

SESSION_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

print_success "Secure secrets generated"

# Create production environment file
print_status "Creating production environment configuration..."

cat > .env.production.example << EOF
# Production Environment Variables for Render.com
# Copy these values to your Render dashboard

NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:port/database_name
SESSION_SECRET=$SESSION_SECRET
ENCRYPTION_MASTER_KEY=$ENCRYPTION_KEY
LOG_LEVEL=info
DOMAIN=turoezpass.com
ALLOWED_ORIGINS=https://turoezpass.com,https://www.turoezpass.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
MAX_FILE_SIZE=10485760
EOF

print_success "Production environment file created: .env.production.example"

# Check if package.json has the right scripts
print_status "Verifying package.json scripts..."

if ! grep -q '"start".*"node server-production.js"' package.json; then
    print_warning "Updating package.json start script..."
    # This is a simple update - in a real scenario, you might want to use a JSON parser
    sed -i '' 's/"start".*"node server.js"/"start": "node server-production.js"/' package.json
fi

print_success "Package.json configured for production"

# Install PostgreSQL driver
print_status "Installing PostgreSQL driver..."
npm install pg
print_success "PostgreSQL driver installed"

# Final commit if needed
if [ -n "$(git status --porcelain)" ]; then
    git add .
    git commit -m "Add production configuration and PostgreSQL driver"
    git push origin main
    print_success "Production updates pushed to GitHub"
fi

# Display deployment instructions
echo ""
echo -e "${GREEN}🎉 Your code is ready for deployment!${NC}"
echo ""
echo -e "${BLUE}📋 Next Steps:${NC}"
echo ""
echo "1. 🌐 Go to https://render.com and log in"
echo "2. ➕ Click 'New +' → 'Web Service'"
echo "3. 🔗 Connect your GitHub account and select the 'turo-ezpass' repository"
echo "4. ⚙️  Configure your service:"
echo "   • Name: turo-toll-tracker"
echo "   • Environment: Node"
echo "   • Build Command: npm ci && npm install pg"
echo "   • Start Command: npm start"
echo "5. 🔧 Add Environment Variables (copy from .env.production.example):"
echo "   • NODE_ENV=production"
echo "   • SESSION_SECRET=$SESSION_SECRET"
echo "   • ENCRYPTION_MASTER_KEY=$ENCRYPTION_KEY"
echo "   • LOG_LEVEL=info"
echo "   • DOMAIN=turoezpass.com"
echo ""
echo "6. 🗄️  Create PostgreSQL Database:"
echo "   • Click 'New +' → 'PostgreSQL'"
echo "   • Name: turo-toll-db"
echo "   • Copy the DATABASE_URL to your web service environment variables"
echo ""
echo "7. 🌍 Configure Domain:"
echo "   • In your web service settings, add custom domains:"
echo "     - turoezpass.com"
echo "     - www.turoezpass.com"
echo "   • Update your DNS records at your domain registrar:"
echo "     - CNAME @ → turo-toll-tracker.onrender.com"
echo "     - CNAME www → turo-toll-tracker.onrender.com"
echo ""
echo "8. 📊 Migrate Your Data:"
echo "   • After deployment, set DATABASE_URL environment variable locally"
echo "   • Run: node scripts/migrate-to-postgresql.js"
echo ""
echo -e "${YELLOW}📖 Detailed instructions available in:${NC}"
echo "   • PRODUCTION-DEPLOYMENT.md - Complete deployment guide"
echo "   • DOMAIN-SETUP.md - Domain configuration help"
echo ""
echo -e "${GREEN}🔐 Security Notes:${NC}"
echo "   • Never commit your .env.production.example file with real secrets"
echo "   • These generated secrets are unique - save them securely"
echo "   • Your app will be available at https://turoezpass.com after DNS propagation"
echo ""
echo -e "${BLUE}💡 Quick Test After Deployment:${NC}"
echo "   • Visit https://your-app.onrender.com/health (should return 'healthy')"
echo "   • Test user registration and login"
echo "   • Verify dashboard loads with data"
echo ""
echo -e "${GREEN}🎯 Your deployment is ready! Good luck! 🚀${NC}"