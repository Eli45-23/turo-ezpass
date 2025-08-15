#!/bin/bash

# Turo Toll Tracker - Production Setup Script
# This script sets up the optimized production environment

set -e  # Exit on any error

echo "🚗 Turo Toll Tracker - Production Setup"
echo "======================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root for security reasons"
   exit 1
fi

# Check Node.js version
print_status "Checking Node.js version..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="16.0.0"

if ! node -p "require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION')" &> /dev/null; then
    print_error "Node.js version $NODE_VERSION is too old. Please upgrade to 16.0.0 or higher."
    exit 1
fi

print_success "Node.js version $NODE_VERSION is compatible"

# Check if Redis is available
print_status "Checking Redis availability..."
if ! command -v redis-cli &> /dev/null; then
    print_warning "Redis is not installed or not in PATH"
    print_status "Installing Redis..."
    
    # Detect OS and install Redis
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y redis-server
        elif command -v yum &> /dev/null; then
            sudo yum install -y redis
        else
            print_error "Unable to install Redis automatically. Please install Redis manually."
            exit 1
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install redis
        else
            print_error "Please install Redis using Homebrew: brew install redis"
            exit 1
        fi
    else
        print_error "Unsupported OS. Please install Redis manually."
        exit 1
    fi
fi

# Test Redis connection
print_status "Testing Redis connection..."
if redis-cli ping | grep -q "PONG"; then
    print_success "Redis is running and accessible"
else
    print_warning "Redis is not running. Starting Redis..."
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo systemctl start redis-server
        sudo systemctl enable redis-server
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        brew services start redis
    fi
    
    # Wait and test again
    sleep 2
    if redis-cli ping | grep -q "PONG"; then
        print_success "Redis started successfully"
    else
        print_error "Failed to start Redis. Please start Redis manually."
        exit 1
    fi
fi

# Install Node.js dependencies
print_status "Installing Node.js dependencies..."
if [ -f "package-optimized.json" ]; then
    cp package-optimized.json package.json
    print_status "Using optimized package configuration"
fi

npm install --production
print_success "Dependencies installed successfully"

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p logs backups/daily backups/weekly backups/monthly backups/manual backups/temp uploads
print_success "Directories created"

# Set up environment configuration
print_status "Setting up environment configuration..."
if [ ! -f ".env" ]; then
    if [ -f ".env.production.example" ]; then
        cp .env.production.example .env
        print_success "Environment template copied to .env"
        print_warning "IMPORTANT: Please edit .env file with your configuration before starting the server"
        print_warning "Required: SESSION_SECRET, ENCRYPTION_MASTER_KEY (generate with: openssl rand -hex 32)"
    else
        print_error ".env.production.example not found"
        exit 1
    fi
else
    print_success ".env file already exists"
fi

# Check environment file
print_status "Validating environment configuration..."
if [ -f ".env" ]; then
    # Check for required variables
    MISSING_VARS=""
    
    if ! grep -q "SESSION_SECRET=" .env || grep -q "SESSION_SECRET=your_secure_32_character" .env; then
        MISSING_VARS="$MISSING_VARS SESSION_SECRET"
    fi
    
    if ! grep -q "ENCRYPTION_MASTER_KEY=" .env || grep -q "ENCRYPTION_MASTER_KEY=your_secure_32_character" .env; then
        MISSING_VARS="$MISSING_VARS ENCRYPTION_MASTER_KEY"
    fi
    
    if [ -n "$MISSING_VARS" ]; then
        print_error "Missing or unconfigured environment variables: $MISSING_VARS"
        print_status "Generating secure keys..."
        
        # Generate secure keys
        SESSION_SECRET=$(openssl rand -hex 32)
        ENCRYPTION_KEY=$(openssl rand -hex 32)
        
        # Replace in .env file
        sed -i.bak "s/SESSION_SECRET=.*/SESSION_SECRET=$SESSION_SECRET/" .env
        sed -i.bak "s/ENCRYPTION_MASTER_KEY=.*/ENCRYPTION_MASTER_KEY=$ENCRYPTION_KEY/" .env
        
        print_success "Secure keys generated and configured"
    else
        print_success "Environment configuration is valid"
    fi
fi

# Initialize database with optimizations
print_status "Initializing optimized database..."
node -e "
const db = require('./config/database');
db.initialize();
console.log('Database initialized with optimizations');
process.exit(0);
" || {
    print_error "Database initialization failed"
    exit 1
}
print_success "Database initialized successfully"

# Set up PM2 if available or suggest installation
print_status "Checking process manager..."
if command -v pm2 &> /dev/null; then
    print_success "PM2 is available for process management"
    print_status "You can use: npm run pm2:start"
else
    print_warning "PM2 not found. Installing PM2 globally..."
    npm install -g pm2 || {
        print_warning "Failed to install PM2 globally. Install with: npm install -g pm2"
    }
fi

# Create systemd service file (Linux only)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    print_status "Creating systemd service file..."
    SERVICE_FILE="/etc/systemd/system/turo-toll-tracker.service"
    
    if [ ! -f "$SERVICE_FILE" ]; then
        sudo tee $SERVICE_FILE > /dev/null <<EOF
[Unit]
Description=Turo Toll Tracker
After=network.target redis.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$PWD
ExecStart=$(which node) server-optimized.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=turo-toll-tracker

[Install]
WantedBy=multi-user.target
EOF
        
        sudo systemctl daemon-reload
        print_success "Systemd service created. Enable with: sudo systemctl enable turo-toll-tracker"
    else
        print_success "Systemd service already exists"
    fi
fi

# Final setup verification
print_status "Running setup verification..."

# Check if optimized server file exists
if [ ! -f "server-optimized.js" ]; then
    print_error "server-optimized.js not found"
    exit 1
fi

# Test configuration loading
node -e "
require('dotenv').config();
if (!process.env.SESSION_SECRET || !process.env.ENCRYPTION_MASTER_KEY) {
    console.error('Environment configuration incomplete');
    process.exit(1);
}
console.log('Configuration loaded successfully');
" || {
    print_error "Configuration verification failed"
    exit 1
}

print_success "Setup verification completed successfully"

echo ""
echo "🎉 Production Setup Complete!"
echo "=============================="
echo ""
print_success "Your Turo Toll Tracker is ready for production deployment!"
echo ""
print_status "Quick Start Commands:"
echo "  Development:    npm run dev"
echo "  Production:     npm run production"
echo "  With PM2:       npm run pm2:start"
echo "  Health Check:   npm run test:health"
echo "  View Metrics:   npm run test:metrics"
echo ""
print_status "Important URLs (when running):"
echo "  Dashboard:      http://localhost:3000/"
echo "  Health Check:   http://localhost:3000/health"
echo "  System Status:  http://localhost:3000/status"
echo "  Metrics:        http://localhost:3000/api/health/metrics"
echo ""
print_status "Log Files:"
echo "  Combined:       logs/combined.log"
echo "  Errors:         logs/error.log"
echo "  Performance:    logs/performance.log"
echo "  Database:       logs/database.log"
echo ""
print_warning "Next Steps:"
print_warning "1. Review and customize .env configuration"
print_warning "2. Test the application: npm run dev"
print_warning "3. Check health status: npm run test:health"
print_warning "4. Deploy to production: npm run production"
print_warning "5. Monitor performance: npm run test:metrics"
echo ""
print_status "For detailed documentation, see SCALABILITY_GUIDE.md"
echo "Ready to handle hundreds of concurrent users! 🚀"