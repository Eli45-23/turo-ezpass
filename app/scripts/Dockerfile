# Dockerfile for turo-ezpass-scrapers Node.js CLI application
# Uses Playwright for browser automation with AWS Secrets Manager integration

FROM node:18-slim

# Install system dependencies required for Playwright browsers
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies)
RUN npm ci --silent

# Install Playwright browsers after dependencies
RUN npx playwright install --with-deps chromium

# Prune devDependencies for a slimmer production image
RUN npm prune --production

# Copy the rest of the application code
COPY . .

# Create screenshots directory for output
RUN mkdir -p scrapers/screenshots

# Set proper permissions for executable scripts
RUN chmod +x create-turo-secret.sh create-ezpass-secret.sh

# No ports to expose (CLI application)

# Define healthcheck that runs both scrapers within 60s timeout
HEALTHCHECK --interval=5m --timeout=60s --start-period=30s --retries=2 \
    CMD timeout 60s npm run scrape-ezpass && timeout 60s npm run scrape-turo || exit 1

# Default command runs both scrapers in sequence
CMD ["sh", "-c", "npm run scrape-ezpass && npm run scrape-turo"]