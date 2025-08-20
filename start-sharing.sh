#!/bin/bash

# Turo Toll Tracker - Quick Sharing Setup
# This script sets up ngrok for instant internet access to your local app

echo "🚀 Setting up Turo Toll Tracker for sharing..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install npm first.${NC}"
    exit 1
fi

echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating basic .env file...${NC}"
    cp .env.example .env 2>/dev/null || echo "NODE_ENV=development
PORT=3000
SESSION_SECRET=$(openssl rand -hex 32)
ENCRYPTION_MASTER_KEY=$(openssl rand -hex 32)" > .env
    echo -e "${GREEN}✅ Basic .env file created. You may need to customize it.${NC}"
fi

echo -e "${BLUE}🔧 Starting the application...${NC}"

# Start the server in the background
npm run dev &
SERVER_PID=$!

# Wait a moment for the server to start
sleep 3

echo -e "${BLUE}🌐 Setting up ngrok tunnel...${NC}"

# Check if ngrok is installed globally
if command -v ngrok &> /dev/null; then
    echo -e "${GREEN}✅ Using globally installed ngrok${NC}"
    ngrok http 3000 &
    NGROK_PID=$!
elif npm list ngrok &> /dev/null; then
    echo -e "${GREEN}✅ Using locally installed ngrok${NC}"
    npx ngrok http 3000 &
    NGROK_PID=$!
else
    echo -e "${YELLOW}📥 Installing ngrok...${NC}"
    npm install ngrok
    npx ngrok http 3000 &
    NGROK_PID=$!
fi

echo ""
echo -e "${GREEN}🎉 Turo Toll Tracker is now running and shared!${NC}"
echo ""
echo -e "${BLUE}📍 Local access:${NC} http://localhost:3000"
echo -e "${BLUE}🌍 Public access:${NC} Check the ngrok terminal for the public URL"
echo ""
echo -e "${YELLOW}💡 Tips:${NC}"
echo "  • The public URL changes each time you restart ngrok"
echo "  • Share the ngrok URL with your testers"
echo "  • Press Ctrl+C to stop both services"
echo ""
echo -e "${GREEN}🔍 To check the ngrok URL, visit:${NC} http://127.0.0.1:4040"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Stopping services...${NC}"
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null
    fi
    if [ ! -z "$NGROK_PID" ]; then
        kill $NGROK_PID 2>/dev/null
    fi
    echo -e "${GREEN}✅ Services stopped.${NC}"
    exit 0
}

# Set up trap to cleanup on script exit
trap cleanup INT TERM EXIT

# Keep the script running
wait