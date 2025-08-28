const { DateTime } = require('luxon');

/**
 * Timezone utilities for consistent date handling across the application
 * Handles conversion between Eastern Time (where Turo and E-ZPass operate) and UTC (database storage)
 */

const EASTERN_TIMEZONE = 'America/New_York';
const UTC_TIMEZONE = 'UTC';

/**
 * Parse a date string from Turo CSV (Eastern Time) and convert to UTC
 * @param {string} dateStr - Date string in format "2025-08-21 10:00 AM"
 * @returns {Date} UTC Date object
 */
function parseTuroDateTime(dateStr) {
    if (!dateStr) return null;
    
    try {
        // Turo dates are in Eastern Time format: "2025-08-21 10:00 AM"
        const dt = DateTime.fromFormat(dateStr, 'yyyy-MM-dd h:mm a', { 
            zone: EASTERN_TIMEZONE 
        });
        
        if (!dt.isValid) {
            console.warn(`⚠️ Invalid Turo date format: ${dateStr}`);
            return null;
        }
        
        // Convert to UTC and return as JavaScript Date
        return dt.toUTC().toJSDate();
    } catch (error) {
        console.error(`❌ Error parsing Turo date ${dateStr}:`, error);
        return null;
    }
}

/**
 * Parse E-ZPass date and time (Eastern Time) and convert to UTC
 * @param {string} dateStr - Date string in format "08/17/2025"
 * @param {string} timeStr - Time string in format "09:47 PM"
 * @returns {Date} UTC Date object
 */
function parseEzPassDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    
    try {
        // E-ZPass dates are in Eastern Time
        // Date format: "08/17/2025", Time format: "09:47 PM"
        const combinedStr = `${dateStr} ${timeStr}`;
        const dt = DateTime.fromFormat(combinedStr, 'MM/dd/yyyy h:mm a', { 
            zone: EASTERN_TIMEZONE 
        });
        
        if (!dt.isValid) {
            console.warn(`⚠️ Invalid E-ZPass date/time format: ${combinedStr}`);
            return null;
        }
        
        // Convert to UTC and return as JavaScript Date
        return dt.toUTC().toJSDate();
    } catch (error) {
        console.error(`❌ Error parsing E-ZPass date/time ${dateStr} ${timeStr}:`, error);
        return null;
    }
}

/**
 * Convert UTC Date to Eastern Time for display
 * @param {Date|string} utcDate - UTC Date object or ISO string
 * @param {boolean} includeTime - Whether to include time in output
 * @returns {string} Formatted date in Eastern Time
 */
function formatEasternTime(utcDate, includeTime = true) {
    if (!utcDate) return '';
    
    try {
        const dt = DateTime.fromJSDate(new Date(utcDate)).setZone(EASTERN_TIMEZONE);
        
        if (includeTime) {
            return dt.toFormat('MM/dd/yyyy h:mm a ZZZZ');
        } else {
            return dt.toFormat('MM/dd/yyyy');
        }
    } catch (error) {
        console.error(`❌ Error formatting Eastern time:`, error);
        return utcDate.toString();
    }
}

/**
 * Convert UTC Date to display format for trips page
 * @param {Date|string} utcDate - UTC Date object or ISO string
 * @returns {string} Formatted date for UI display
 */
function formatTripDateTime(utcDate) {
    if (!utcDate) return '';
    
    try {
        const dt = DateTime.fromJSDate(new Date(utcDate)).setZone(EASTERN_TIMEZONE);
        return dt.toFormat('M/d/yyyy h:mm a');
    } catch (error) {
        console.error(`❌ Error formatting trip date:`, error);
        return utcDate.toString();
    }
}

/**
 * Check if two dates are within the same time window for toll matching
 * @param {Date} tollDate - Toll date (UTC)
 * @param {Date} tripStart - Trip start date (UTC) 
 * @param {Date} tripEnd - Trip end date (UTC)
 * @param {number} bufferHours - Buffer hours before/after trip
 * @returns {boolean} True if toll is within trip window
 */
function isWithinTripWindow(tollDate, tripStart, tripEnd, bufferHours = 2) {
    if (!tollDate || !tripStart || !tripEnd) return false;
    
    try {
        const toll = DateTime.fromJSDate(new Date(tollDate));
        const start = DateTime.fromJSDate(new Date(tripStart)).minus({ hours: bufferHours });
        const end = DateTime.fromJSDate(new Date(tripEnd)).plus({ hours: bufferHours });
        
        return toll >= start && toll <= end;
    } catch (error) {
        console.error(`❌ Error checking trip window:`, error);
        return false;
    }
}

/**
 * Get the current date/time in Eastern Time
 * @returns {DateTime} Current DateTime in Eastern timezone
 */
function getCurrentEasternTime() {
    return DateTime.now().setZone(EASTERN_TIMEZONE);
}

/**
 * Convert any date to UTC for database storage
 * @param {Date|string} date - Input date
 * @param {string} sourceTimezone - Source timezone (defaults to Eastern)
 * @returns {Date} UTC Date object
 */
function toUTC(date, sourceTimezone = EASTERN_TIMEZONE) {
    if (!date) return null;
    
    try {
        let dt;
        if (typeof date === 'string') {
            dt = DateTime.fromISO(date, { zone: sourceTimezone });
        } else {
            dt = DateTime.fromJSDate(date, { zone: sourceTimezone });
        }
        
        return dt.toUTC().toJSDate();
    } catch (error) {
        console.error(`❌ Error converting to UTC:`, error);
        return null;
    }
}

module.exports = {
    parseTuroDateTime,
    parseEzPassDateTime,
    formatEasternTime,
    formatTripDateTime,
    isWithinTripWindow,
    getCurrentEasternTime,
    toUTC,
    EASTERN_TIMEZONE,
    UTC_TIMEZONE
};