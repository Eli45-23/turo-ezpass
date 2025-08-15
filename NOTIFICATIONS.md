# Turo Toll Tracker - Notification & Communication System

## Overview

The Turo Toll Tracker includes a comprehensive notification and communication system that automatically keeps all stakeholders informed about toll charges, trip completions, and system status. The system is designed to be professional, reliable, and user-friendly.

## Features

### 🚀 Automated Email Notifications
- **Toll Charge Alerts**: Immediate notification when new toll charges are detected
- **Trip Completion Summaries**: Detailed breakdown when trips are completed
- **Weekly/Monthly Reports**: Regular summaries of toll activity
- **System Alerts**: Important system notifications for hosts
- **Invoice Notifications**: When invoices are generated and ready

### 📱 Real-time WebSocket Notifications
- Live updates to host dashboards
- Instant toll matching notifications
- System status alerts
- Real-time trip monitoring

### 🎛️ User Preference Management
- Granular control over notification types
- Email preferences per notification category
- Real-time alert settings
- Opt-in/opt-out functionality

### 🔄 Professional Email Templates
- Branded, responsive HTML templates
- Professional design with Turo branding
- Mobile-friendly layouts
- Customizable content per notification type

### 🛡️ Reliable Delivery System
- Multiple email provider support with automatic failover
- Delivery tracking and audit trails
- Retry mechanisms for failed deliveries
- Queue management for bulk notifications

## Architecture

### Core Components

1. **EmailService** (`/services/email-service.js`)
   - Multi-provider email delivery with failover
   - Template compilation and rendering
   - Delivery tracking and statistics
   - Queue management

2. **NotificationManager** (`/services/notification-manager.js`)
   - Central notification orchestration
   - Event-based notification triggering
   - Preference management
   - Statistics and reporting

3. **Scheduler Integration** (`/services/scheduler.js`)
   - Automated notification scheduling
   - Periodic summary reports
   - Queue processing
   - Background job management

4. **API Routes** (`/routes/notifications.js`)
   - RESTful notification management
   - Preference configuration
   - Manual notification sending
   - Statistics and history

### Database Schema

The notification system adds several new tables:

- **notification_preferences**: User notification settings
- **notification_queue**: Queued notifications for delivery
- **notification_logs**: Delivery audit trail
- **notification_events**: Event tracking for triggers

## Setup & Configuration

### 1. Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Primary Email Provider (Gmail example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password
EMAIL_FROM=noreply@turotolls.com

# Backup Email Provider (Mailgun example)
BACKUP_EMAIL_HOST=smtp.mailgun.org
BACKUP_EMAIL_PORT=587
BACKUP_EMAIL_USER=postmaster@your-domain.mailgun.org
BACKUP_EMAIL_PASSWORD=your-mailgun-api-key
```

### 2. Email Provider Setup

#### Gmail Setup:
1. Enable 2-factor authentication
2. Generate an App-Specific Password
3. Use the app password in `EMAIL_PASSWORD`

#### Mailgun Setup:
1. Create a Mailgun account
2. Add and verify your domain
3. Get your API key and SMTP credentials

### 3. Template Customization

Email templates are stored in `/templates/email/` and use Handlebars syntax:

```handlebars
<h2>New Toll Charge Detected</h2>
<p>Hello {{renterName}},</p>
<p>We've detected a new toll charge from your recent Turo trip:</p>
<div class="toll-item">
    <span>{{tollLocation}} - {{tollDate}}</span>
    <span class="amount">${{tollAmount}}</span>
</div>
```

## API Endpoints

### Notification Preferences
- `GET /api/notifications/preferences` - Get user preferences
- `PUT /api/notifications/preferences` - Update user preferences

### Notification Management
- `POST /api/notifications/send` - Send immediate notification
- `POST /api/notifications/queue` - Queue notification for later
- `POST /api/notifications/process-queue` - Process queued notifications

### Testing & Monitoring
- `POST /api/notifications/test` - Send test notifications
- `GET /api/notifications/stats` - Get delivery statistics
- `GET /api/notifications/history` - Get notification history
- `GET /api/notifications/templates` - List available templates

## Usage Examples

### 1. Send Toll Charge Notification

```javascript
await notificationManager.notifyTollCharge(tollCharge, trip, host);
```

### 2. Send Trip Completion Summary

```javascript
await notificationManager.notifyTripCompletion(trip, tolls, host);
```

### 3. Send System Alert to Host

```javascript
await notificationManager.sendHostAlert(
    hostId, 
    'SYSTEM_MAINTENANCE', 
    'Scheduled maintenance tonight from 2-4 AM',
    'No action required'
);
```

### 4. Queue Weekly Summary

```javascript
await notificationManager.emailService.queueEmail({
    to: renterEmail,
    template: 'weekly-summary',
    data: summaryData,
    scheduleTime: nextMondayAt9AM
});
```

## Notification Types & Templates

### 1. Toll Charge Notifications
**Template**: `toll-notification`
**Trigger**: When a toll charge is matched to a trip
**Recipients**: Renter
**Data**: Trip details, toll amount, location, date

### 2. Trip Completion
**Template**: `trip-completion`
**Trigger**: When a trip status changes to completed
**Recipients**: Renter
**Data**: Trip summary, all toll charges, total amount

### 3. Weekly Summaries
**Template**: `weekly-summary`
**Trigger**: Every Monday at 9 AM
**Recipients**: Active renters
**Data**: Week's toll activity, total charges

### 4. Monthly Summaries
**Template**: `monthly-summary`
**Trigger**: 1st of each month at 9 AM
**Recipients**: Active renters
**Data**: Month's complete activity, all trips and tolls

### 5. Host Alerts
**Template**: `host-alert`
**Trigger**: System events, errors, maintenance
**Recipients**: Hosts
**Data**: Alert type, message, timestamp, required actions

### 6. System Maintenance
**Template**: `system-maintenance`
**Trigger**: Scheduled maintenance notifications
**Recipients**: All users
**Data**: Maintenance window, duration, expected impact

### 7. Invoice Generated
**Template**: `invoice-generated`
**Trigger**: When invoice is created and ready
**Recipients**: Renter
**Data**: Invoice details, amounts, payment timeline

## WebSocket Real-time Notifications

The system extends the existing WebSocket functionality for real-time notifications:

### Host Dashboard Alerts
```javascript
// Automatic toll matching notification
{
    type: 'toll_matched',
    message: 'New toll charge matched for trip ABC123',
    data: {
        tripId: 'ABC123',
        renterName: 'John Doe',
        tollAmount: 16.00,
        tollLocation: 'George Washington Bridge'
    }
}

// System alert
{
    type: 'system_alert',
    message: 'High toll matching activity detected',
    data: {
        alertType: 'HIGH_ACTIVITY',
        timestamp: '2024-01-15T10:30:00Z',
        actionRequired: 'Review recent matches'
    }
}
```

## Monitoring & Analytics

### Delivery Statistics
- Total notifications sent
- Delivery success rates
- Provider performance
- Template usage statistics
- User engagement metrics

### Error Handling
- Failed delivery tracking
- Automatic retry mechanisms
- Provider failover logs
- User feedback handling

## Scheduling & Automation

### Automated Jobs
- **Toll Matching**: Every 30 minutes
- **Queue Processing**: Every 15 minutes  
- **Weekly Summaries**: Mondays at 9 AM
- **Monthly Summaries**: 1st of month at 9 AM
- **System Health Checks**: Every hour

### Custom Scheduling
Queue notifications for specific times:

```javascript
await notificationManager.emailService.queueEmail({
    to: 'user@example.com',
    template: 'custom-reminder',
    data: reminderData,
    scheduleTime: '2024-01-20T09:00:00Z'
});
```

## Best Practices

### 1. Email Deliverability
- Use reputable email providers
- Configure SPF, DKIM, and DMARC records
- Monitor reputation and deliverability metrics
- Implement proper unsubscribe mechanisms

### 2. User Experience
- Respect user preferences
- Provide clear opt-out options
- Send relevant, timely notifications
- Use professional, branded templates

### 3. System Reliability
- Configure multiple email providers
- Implement proper error handling
- Monitor delivery rates
- Set up alerts for system issues

### 4. Performance
- Use queue system for bulk notifications
- Implement rate limiting
- Monitor database performance
- Cache template compilation

## Troubleshooting

### Common Issues

1. **Emails not sending**
   - Check email provider credentials
   - Verify SMTP settings
   - Check network connectivity
   - Review delivery logs

2. **Templates not loading**
   - Verify template file exists
   - Check file permissions
   - Review template syntax
   - Check Handlebars compilation

3. **High bounce rates**
   - Verify email addresses
   - Check email content for spam triggers
   - Review sender reputation
   - Implement proper authentication

### Debug Commands

```bash
# Test email configuration
curl -X POST http://localhost:3000/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{"type": "email-test"}' \
  -b "session-cookie"

# Check notification stats
curl http://localhost:3000/api/notifications/stats \
  -b "session-cookie"

# Process queue manually
curl -X POST http://localhost:3000/api/notifications/process-queue \
  -b "session-cookie"
```

## Future Enhancements

### Planned Features
- SMS notifications via Twilio
- Push notifications for mobile app
- Advanced analytics dashboard
- A/B testing for email templates
- Integration with marketing automation
- Multi-language support
- Advanced personalization

### Integration Opportunities
- Turo API for direct messaging
- Customer support ticket creation
- Analytics and reporting platforms
- CRM system integration
- Marketing automation platforms

## Support

For issues with the notification system:

1. Check logs in `server.log`
2. Review notification statistics via API
3. Verify email provider settings
4. Test with simple notifications first
5. Check database for queued/failed notifications

The notification system is designed to be robust, scalable, and user-friendly, providing automated communication that enhances the overall Turo toll tracking experience.