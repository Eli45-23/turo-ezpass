# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a comprehensive toll tracking and management system for Turo hosts. It automates the process of matching toll charges from transponder data with Turo trip bookings, helping hosts recover toll costs from guests.

## Development Commands

### Local Development
- `npm run dev` - Start development server on port 3000
- `npm run build:css` - Build Tailwind CSS
- `npm run tunnel` - Start ngrok tunnel for testing
- `npm run share` - Start dev server and tunnel simultaneously

### Production
- `npm start` - Start production server
- Environment variables required: `SESSION_SECRET`, `ENCRYPTION_MASTER_KEY`

### Testing
- No formal test suite yet (`npm test` placeholder exists)
- Manual testing via UI and API endpoints

## Architecture

### Backend Structure
- **server.js** - Main Express application with WebSocket support
- **middleware/** - Security, authentication, and validation middleware
- **routes/** - API endpoints organized by functionality
- **utils/** - Helper utilities for crypto, data integrity, and timezone handling
- **public/** - Frontend HTML files and assets

### Key Components

#### Authentication & Security
- Supabase PostgreSQL-based user authentication with bcrypt
- Comprehensive security middleware with rate limiting
- WebSocket authentication for real-time updates
- CSRF protection and input validation using Joi schemas

#### Database Architecture
- **Supabase PostgreSQL database** with multiple related tables
- **hosts** - Turo host information
- **trips** - Trip bookings from Turo
- **tolls** - Transponder toll charges
- **transponders** - EZ-Pass/transponder account info
- **invoices** - Generated invoices for guests
- Hybrid database configuration supports both SQLite (development) and Supabase (production)
- Data integrity checks and transaction management

#### Core Functionality
- **Toll Matching** - ML-based algorithm to match tolls with trips
- **CSV Upload** - Parse toll data from transponder providers
- **Trip Sync** - Integration with Turo booking data
- **Invoice Generation** - Automated billing for guests
- **Analytics** - Revenue and toll analytics dashboard

### Frontend Architecture
- Pure HTML/CSS/JavaScript (no framework)
- **Tailwind CSS** for styling with custom design system
- **Progressive Web App** features (manifest.json, service worker)
- **Glassmorphism modal system** for overlays
- Multiple dashboard pages: trips, tolls, analytics, invoices

### Multi-User Architecture
- Host-based data isolation (all queries filtered by host_id)
- Session-based authentication with secure cookie handling
- WebSocket connections per authenticated host

## Key Files & Directories

### Critical Business Logic
- `routes/tolls.js` - Toll management and matching algorithms
- `routes/trips.js` - Trip data handling and Turo integration  
- `routes/ml-matching.js` - Machine learning toll matching
- `routes/analytics.js` - Revenue and performance analytics
- `utils/data-integrity.js` - Database consistency checks

### Frontend Pages
- `public/dashboard.html` - Main dashboard overview
- `public/trips.html` - Trip management interface
- `public/upload.html` - CSV toll data upload
- `public/analytics.html` - Analytics and reporting
- `public/invoices.html` - Invoice management
- `public/transponders.html` - Transponder account setup

### Security & Middleware
- `middleware/security.js` - Comprehensive security controls
- `middleware/auth.js` - Authentication middleware
- `middleware/csv-validation.js` - CSV upload validation

## Database Operations

### Common Patterns
- All queries must include `host_id` filtering for data isolation
- Use parameterized queries to prevent SQL injection
- Wrap multi-step operations in transactions
- Check data integrity after modifications

### Database Configuration
- **Hybrid Setup**: Uses `config/database_hybrid.js` to switch between databases
- **Development**: SQLite database for local development (`USE_SUPABASE=false`)
- **Production**: Supabase PostgreSQL for production (`USE_SUPABASE=true`)
- Database schema changes tracked in standalone SQL/JS files
- Apply migrations using `apply_migration.js` utility
- Backup database before major changes

## Development Guidelines

### Security Practices
- Never log sensitive data (passwords, session tokens)
- Validate and sanitize all user inputs
- Use rate limiting on all endpoints
- Implement proper error handling without exposing internals

### Code Conventions
- Use async/await for database operations
- Implement comprehensive error logging with Winston
- Follow existing patterns for route structure and middleware
- Use Joi schemas for input validation

### Frontend Development
- Use existing CSS design system variables
- Implement accessibility features (screen reader support)
- Follow Progressive Web App patterns
- Use the modal system for overlays and confirmations

## Deployment

### Platform Support
- **Render** - Primary deployment platform (render.yaml)
- **Railway** - Alternative platform (railway.json)
- **Fly.io** - Container deployment (fly.toml)
- **Vercel** - Static/serverless deployment (vercel.json)

### Environment Configuration
- Copy `.env.example` to `.env` for local development
- Set `NODE_ENV=production` for production deployments
- Configure secure session secrets and encryption keys
- Set `USE_SUPABASE=true` for production (Supabase) or `false` for development (SQLite)
- Supabase configuration requires `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### Production Considerations
- Supabase PostgreSQL database persists between deployments
- WebSocket connections require stable server instances
- Static file serving optimized with compression
- Security headers and rate limiting enforced
- Hybrid database architecture allows switching between SQLite (dev) and Supabase (prod)