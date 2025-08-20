#!/bin/bash

# Quick Deployment Script for Turo Toll Tracker
# This script helps you quickly deploy your app to various platforms

echo "🚀 Turo Toll Tracker - Quick Deployment Helper"
echo "=============================================="

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Function to generate secure secrets
generate_secrets() {
    echo -e "${BLUE}🔐 Generating secure secrets...${NC}"
    SESSION_SECRET=$(openssl rand -hex 32)
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    echo -e "${GREEN}✅ Secrets generated!${NC}"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Save these values in your deployment platform:${NC}"
    echo "SESSION_SECRET=$SESSION_SECRET"
    echo "ENCRYPTION_MASTER_KEY=$ENCRYPTION_KEY"
    echo ""
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
    
    if ! command -v git &> /dev/null; then
        echo -e "${RED}❌ Git is not installed${NC}"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is not installed${NC}"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}❌ npm is not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All prerequisites met${NC}"
}

# Function to commit changes
commit_changes() {
    echo -e "${BLUE}📝 Committing changes to git...${NC}"
    git add .
    git status
    
    echo ""
    read -p "Enter commit message (or press Enter for default): " commit_msg
    if [ -z "$commit_msg" ]; then
        commit_msg="Deploy: Ready for production deployment"
    fi
    
    git commit -m "$commit_msg"
    git push origin main
    
    echo -e "${GREEN}✅ Changes committed and pushed${NC}"
}

# Main menu
show_menu() {
    echo ""
    echo "Choose your deployment option:"
    echo "1) 🔥 Instant Local Sharing (ngrok)"
    echo "2) ☁️  Deploy to Render.com"
    echo "3) 🚄 Deploy to Railway.app"
    echo "4) 🪂 Deploy to Fly.io"
    echo "5) ⚡ Deploy to Vercel"
    echo "6) 🔐 Generate Security Secrets"
    echo "7) 📝 Commit Changes to Git"
    echo "8) ❌ Exit"
    echo ""
    read -p "Enter your choice (1-8): " choice
}

# Handle menu choice
handle_choice() {
    case $choice in
        1)
            echo -e "${BLUE}🔥 Starting instant local sharing...${NC}"
            if [ -f "./start-sharing.sh" ]; then
                ./start-sharing.sh
            else
                echo -e "${RED}❌ start-sharing.sh not found${NC}"
            fi
            ;;
        2)
            echo -e "${BLUE}☁️  Setting up Render.com deployment...${NC}"
            generate_secrets
            commit_changes
            echo -e "${GREEN}🎉 Ready for Render.com!${NC}"
            echo "Next steps:"
            echo "1. Go to https://render.com"
            echo "2. Connect your GitHub account"
            echo "3. Create a new Web Service"
            echo "4. Select your repository: turo-ezpass"
            echo "5. Use these settings:"
            echo "   - Build Command: npm install"
            echo "   - Start Command: npm start"
            echo "6. Add the environment variables shown above"
            echo "7. Deploy!"
            ;;
        3)
            echo -e "${BLUE}🚄 Setting up Railway.app deployment...${NC}"
            generate_secrets
            commit_changes
            echo -e "${GREEN}🎉 Ready for Railway.app!${NC}"
            echo "Next steps:"
            echo "1. Install Railway CLI: npm install -g @railway/cli"
            echo "2. Run: railway login"
            echo "3. Run: railway init"
            echo "4. Set environment variables:"
            echo "   railway variables set NODE_ENV=production"
            echo "   railway variables set SESSION_SECRET=<generated_value>"
            echo "   railway variables set ENCRYPTION_MASTER_KEY=<generated_value>"
            echo "5. Run: railway up"
            ;;
        4)
            echo -e "${BLUE}🪂 Setting up Fly.io deployment...${NC}"
            generate_secrets
            commit_changes
            echo -e "${GREEN}🎉 Ready for Fly.io!${NC}"
            echo "Next steps:"
            echo "1. Install Fly CLI from: https://fly.io/docs/getting-started/installing-flyctl/"
            echo "2. Run: flyctl auth login"
            echo "3. Run: flyctl launch --copy-config"
            echo "4. Set secrets:"
            echo "   flyctl secrets set SESSION_SECRET=<generated_value>"
            echo "   flyctl secrets set ENCRYPTION_MASTER_KEY=<generated_value>"
            echo "5. Run: flyctl deploy"
            ;;
        5)
            echo -e "${BLUE}⚡ Setting up Vercel deployment...${NC}"
            generate_secrets
            commit_changes
            echo -e "${GREEN}🎉 Ready for Vercel!${NC}"
            echo "Next steps:"
            echo "1. Install Vercel CLI: npm install -g vercel"
            echo "2. Run: vercel"
            echo "3. Follow the prompts"
            echo "4. Add environment variables in Vercel dashboard"
            echo "Note: You may need to adjust serverless function configuration"
            ;;
        6)
            generate_secrets
            ;;
        7)
            commit_changes
            ;;
        8)
            echo -e "${GREEN}👋 Goodbye!${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Invalid option${NC}"
            ;;
    esac
}

# Main script execution
check_prerequisites
show_menu
handle_choice

echo ""
echo -e "${BLUE}📖 For detailed instructions, see DEPLOYMENT.md${NC}"
echo -e "${BLUE}💡 Need help? Open an issue on GitHub${NC}"