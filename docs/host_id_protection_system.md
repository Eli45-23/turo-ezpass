# Host ID Protection System

## Overview
This document describes the comprehensive protection system implemented to prevent host_id mismatches that could break toll matching functionality.

## The Problem
Previously, toll_account #46 had an incorrect host_id that prevented the SimpleTollMatcher from accessing toll data, causing the system to appear broken when it was actually working correctly but couldn't see the data due to isolation.

## Protection Measures Implemented

### 1. Database Constraints & Triggers
**File:** `/migrations/add_host_id_validation.sql`

- **Check Constraints:** Ensure host_id format is valid UUID
- **Consistency Triggers:** Prevent toll_charges from having different host_id than their parent toll_account  
- **Validation Functions:** Comprehensive host_id validation on INSERT/UPDATE
- **Indexes:** Optimized lookups for host_id consistency checks

### 2. CSV Upload Validation
**File:** `routes/dashboard.js` (lines 1855-1970)

- **Explicit host_id Assignment:** All toll_charges get host_id from authenticated session
- **Validation Logging:** Track host_id assignments during CSV upload
- **Session Validation:** Ensure host_id comes from authenticated user session

### 3. Monitoring & Detection
**Endpoints:**
- `GET /monitor/host-id-mismatches` - Detect existing mismatches
- `POST /admin/emergency-host-id-fix` - Emergency repair tool

**Features:**
- Real-time mismatch detection
- Orphaned account identification  
- Detailed reporting with recommendations
- Emergency fix capability with safety confirmation

### 4. Monitoring View
**Database View:** `host_id_mismatch_monitor`

Automatically detects:
- toll_charges with mismatched host_id
- transponder_plate_mappings with mismatched host_id
- Provides clear reporting for administrators

## How to Use

### Regular Monitoring
```bash
curl -X GET http://localhost:3000/dashboard/monitor/host-id-mismatches
```

### Emergency Fix (Use with Caution)
```bash
curl -X POST http://localhost:3000/dashboard/admin/emergency-host-id-fix \
  -H "Content-Type: application/json" \
  -d '{"confirmPhrase": "EMERGENCY_FIX_HOST_ID_MISMATCHES"}'
```

## Prevention Strategy

### 1. Session-Based host_id
All data operations use `req.session.hostId` from authenticated sessions, preventing cross-contamination.

### 2. Database-Level Validation
Triggers and constraints prevent invalid host_id combinations at the database level.

### 3. Upload-Time Validation  
CSV uploads explicitly validate and assign correct host_id values.

### 4. Continuous Monitoring
Monitoring endpoints allow proactive detection of any issues.

## Migration Instructions

1. **Apply Database Migration:**
```sql
-- Run the migration (when not in read-only mode)
-- \i migrations/add_host_id_validation.sql
```

2. **Deploy Code Updates:**
The protection system is now integrated into the main application.

3. **Verify Protection:**
```bash
# Check for any existing issues
curl -X GET http://localhost:3000/dashboard/monitor/host-id-mismatches
```

## Best Practices

1. **Always use authenticated host_id** from `req.session.hostId`
2. **Never hardcode host_id values** in application code
3. **Run monitoring checks** after bulk data operations
4. **Test CSV uploads** in development environment first
5. **Monitor database logs** for constraint violations

## Recovery Procedures

If host_id mismatches are detected:

1. **Assess Impact:** Use monitoring endpoint to understand scope
2. **Identify Root Cause:** Determine how mismatches occurred  
3. **Fix Data:** Use emergency fix endpoint with proper confirmation
4. **Verify Resolution:** Re-run monitoring to confirm fixes
5. **Update Processes:** Modify procedures to prevent recurrence

## Technical Details

### Database Constraints
- `toll_accounts_host_id_consistency_check`: Validates UUID format
- `toll_charges_host_id_consistency_check`: Ensures parent/child consistency
- `validate_host_id_consistency()`: Trigger function for validation

### Emergency Functions
- `fix_host_id_mismatches(uuid)`: Repairs mismatches for given host_id
- Returns count of fixed records per table

### Monitoring Queries
The system monitors:
- toll_charges ↔ toll_accounts consistency
- transponder_plate_mappings ↔ toll_accounts consistency  
- Orphaned toll_accounts

## Impact on Toll Matching

With this protection system:
- ✅ Toll matching will always see the correct data
- ✅ No more "invisible" toll charges due to host_id mismatches
- ✅ Proactive detection prevents issues before they impact users
- ✅ Emergency recovery tools available if needed

The SimpleTollMatcher algorithm remains unchanged - it was always correct. This system ensures it always has access to the right data.