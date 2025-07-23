#!/bin/bash

# create-ezpass-secret.sh
# Shell script to create E-ZPass credentials in AWS Secrets Manager
# Generated for E-ZPass NY portal authentication

set -e  # Exit on any error

echo "🔐 E-ZPass Credentials Setup for AWS Secrets Manager"
echo "==================================================="
echo

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ Error: AWS CLI is not installed or not in PATH"
    echo "Please install AWS CLI first: https://aws.amazon.com/cli/"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ Error: AWS credentials not configured"
    echo "Please run 'aws configure' first to set up your AWS credentials"
    exit 1
fi

echo "✅ AWS CLI found and credentials configured"
echo

# Prompt for E-ZPass credentials
echo "Please enter your E-ZPass NY portal credentials:"
echo

read -p "E-ZPass Username: " EZPASS_USERNAME

# Validate username is not empty
if [[ -z "$EZPASS_USERNAME" ]]; then
    echo "❌ Error: Username cannot be empty"
    exit 1
fi

# Prompt for password securely (no echo)
read -s -p "E-ZPass Password: " EZPASS_PASSWORD
echo
echo

# Validate password is not empty
if [[ -z "$EZPASS_PASSWORD" ]]; then
    echo "❌ Error: Password cannot be empty"
    exit 1
fi

# Prompt for state (default NY)
read -p "E-ZPass State [ny]: " EZPASS_STATE
EZPASS_STATE=${EZPASS_STATE:-ny}

# Create temporary credentials file
TEMP_FILE="ezpass-creds.json"
echo "📝 Creating temporary credentials file..."

cat > "$TEMP_FILE" << EOF
{
  "username": "$EZPASS_USERNAME",
  "password": "$EZPASS_PASSWORD",
  "state": "$EZPASS_STATE"
}
EOF

echo "✅ Temporary file created: $TEMP_FILE"
echo

# Create the secret in AWS Secrets Manager
echo "🚀 Creating secret in AWS Secrets Manager..."
echo "Secret name: turo-ezpass/ezpass/credentials"
echo

if aws secretsmanager create-secret \
    --name turo-ezpass/ezpass/credentials \
    --description "E-ZPass NY portal login credentials" \
    --secret-string file://"$TEMP_FILE"; then
    
    echo "✅ Secret created successfully in AWS Secrets Manager!"
    
else
    echo "❌ Failed to create secret. The secret may already exist."
    echo "To update existing secret, use:"
    echo "aws secretsmanager update-secret --secret-id turo-ezpass/ezpass/credentials --secret-string file://$TEMP_FILE"
    
    # Clean up temp file before exit
    rm -f "$TEMP_FILE"
    exit 1
fi

# Clean up temporary file
echo
echo "🧹 Cleaning up temporary file..."
rm -f "$TEMP_FILE"

if [[ ! -f "$TEMP_FILE" ]]; then
    echo "✅ Temporary file deleted successfully"
else
    echo "⚠️  Warning: Could not delete temporary file $TEMP_FILE"
fi

echo
echo "🎉 Setup complete! Your E-ZPass credentials are now stored securely in AWS Secrets Manager."
echo "The E-ZPass scraper can now retrieve these credentials automatically."
echo
echo "Secret ARN: arn:aws:secretsmanager:$(aws configure get region):$(aws sts get-caller-identity --query Account --output text):secret:turo-ezpass/ezpass/credentials"
echo