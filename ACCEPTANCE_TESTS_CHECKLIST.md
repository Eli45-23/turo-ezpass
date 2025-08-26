# Complete Data Isolation - Acceptance Tests Checklist

## User Isolation Tests ✅

### Test 1: Basic User Isolation
- [ ] **Setup**: Create two test accounts (User A, User B)
- [ ] **Step 1**: Log in as User A
- [ ] **Step 2**: Upload trips CSV and tolls CSV for User A  
- [ ] **Step 3**: Verify only User A's data appears on all pages
- [ ] **Step 4**: Log out User A, log in as User B
- [ ] **Step 5**: Verify NO User A data is visible anywhere
- [ ] **Step 6**: Upload different CSVs for User B
- [ ] **Step 7**: Verify only User B's data is visible
- [ ] **Expected**: Complete data isolation between accounts

### Test 2: Session Cache Clearing
- [ ] **Setup**: User A logged in with data visible
- [ ] **Step 1**: Note specific trip/toll details from User A
- [ ] **Step 2**: Logout User A (should destroy session)
- [ ] **Step 3**: Login User B immediately on same browser/device
- [ ] **Step 4**: Check all pages (dashboard, trips, tolls, analytics)
- [ ] **Expected**: Zero stale cache data from User A visible to User B

### Test 3: Concurrent Users (Different Browsers)
- [ ] **Setup**: User A in Browser 1, User B in Browser 2
- [ ] **Step 1**: Both users upload different CSV data simultaneously
- [ ] **Step 2**: Both users run toll matching
- [ ] **Step 3**: Both users create invoices
- [ ] **Expected**: No data cross-contamination between browsers

## CSV Upload and Matching Tests ✅

### Test 4: Duplicate CSV Upload Prevention
- [ ] **Setup**: User A logged in
- [ ] **Step 1**: Upload trips.csv and tolls.csv
- [ ] **Step 2**: Run toll matching (note results)
- [ ] **Step 3**: Upload SAME trips.csv and tolls.csv again
- [ ] **Step 4**: Verify no duplicate trips/tolls created
- [ ] **Expected**: System prevents duplicates, no double-counting

### Test 5: Personal Tolls Detection
- [ ] **Setup**: Upload tolls that fall OUTSIDE all trip windows
- [ ] **Step 1**: Upload trips CSV (covering July 1-15)
- [ ] **Step 2**: Upload tolls CSV with dates in June + within July + in August  
- [ ] **Step 3**: Run toll matching
- [ ] **Expected**: 
  - June & August tolls → Personal Tolls tab
  - July tolls → Matched to trips
  - Zero tolls left unmatched without categorization

### Test 6: Late Tolls Detection
- [ ] **Setup**: Trip already invoiced, then new tolls arrive
- [ ] **Step 1**: Complete trip with tolls, create invoice
- [ ] **Step 2**: Upload NEW CSV with additional tolls for same trip dates  
- [ ] **Step 3**: Run late toll detection
- [ ] **Expected**:
  - New tolls appear in Late Tolls tab
  - Linked to original trip and invoice
  - NOT included in regular trip matching

## Trip Categorization Tests ✅

### Test 7: Trip Status Categories (Date-Based Only)
- [ ] **Setup**: Upload trips with various dates relative to "today"
- [ ] **Test Data**:
  - Trip A: July 1-5 (past) ✅ → Completed
  - Trip B: Today -1 to Today +1 (active) ✅ → In Progress  
  - Trip C: Next week (future) ✅ → Upcoming
- [ ] **Expected**: Trips categorized solely by dates, ignoring status fields

### Test 8: Completed Trips with Zero Tolls
- [ ] **Setup**: Upload completed trip with NO matching tolls
- [ ] **Step 1**: Verify trip appears in Completed tab
- [ ] **Expected**: ALL completed trips show regardless of toll amount

## Data Boundary Enforcement Tests ✅

### Test 9: Cross-Host Matching Prevention
- [ ] **Setup**: User A has tolls, User B has trips with matching plates/dates
- [ ] **Step 1**: User A runs toll matching
- [ ] **Expected**: A's tolls NEVER match to B's trips (security logs show blocked attempts)

### Test 10: API Endpoint Security
- [ ] **Step 1**: Log in as User A, capture API requests
- [ ] **Step 2**: Manually modify hostId in API calls to User B's ID
- [ ] **Expected**: All requests return 403 Forbidden or no data

### Test 11: Database Query Isolation
- [ ] **Step 1**: Monitor database logs during User A session
- [ ] **Expected**: ALL queries include `WHERE host_id = 'user_a_id'` filter

## Background Process Isolation Tests ✅

### Test 12: No Global Toll Matching
- [ ] **Setup**: Multiple users with unmatched tolls
- [ ] **Step 1**: Wait for scheduled background processes
- [ ] **Expected**: NO automatic cross-user toll matching occurs

### Test 13: Per-User Toll Matching Only
- [ ] **Setup**: User A logged in with unmatched tolls
- [ ] **Step 1**: User A manually triggers toll matching
- [ ] **Expected**: Only User A's tolls are processed

## Invoice and Late Toll Integration Tests ✅

### Test 14: Late Toll Chain
- [ ] **Setup**: Trip July 1-5, initial tolls $10
- [ ] **Step 1**: Create invoice for trip ($10 total)
- [ ] **Step 2**: Upload new CSV with $5 additional toll for July 3
- [ ] **Step 3**: Run late toll detection
- [ ] **Expected**: 
  - Late Tolls tab shows $5 toll linked to July trip
  - Late toll references original invoice
  - Can create supplemental invoice for $5

### Test 15: Invoice Toll ID Tracking
- [ ] **Setup**: Trip with 3 tolls ($5, $10, $15)
- [ ] **Step 1**: Create invoice (should record toll IDs)
- [ ] **Step 2**: Upload CSV with same 3 tolls + 1 new toll
- [ ] **Expected**: Only new toll marked as late, originals ignored

## Frontend UI Isolation Tests ✅

### Test 16: Tab Content Isolation
- [ ] **Per User**: Verify each tab shows only relevant data:
  - Completed: Only user's completed trips
  - In Progress: Only user's active trips  
  - Upcoming: Only user's future trips
  - Personal Tolls: Only user's unmatched tolls
  - Late Tolls: Only user's late-discovered tolls

### Test 17: Dashboard Summary Isolation
- [ ] **Step 1**: Check dashboard overview numbers
- [ ] **Expected**: All counts and totals reflect ONLY current user's data

## Database Schema Validation ✅

### Test 18: Required Schema Changes Applied
- [ ] **Verify columns exist**:
  - `toll_charges.is_personal BOOLEAN`
  - `toll_charges.is_late BOOLEAN`  
  - `toll_charges.original_invoice_id BIGINT`
  - `invoices.included_toll_ids TEXT[]`
- [ ] **Verify indexes exist**:
  - `idx_toll_charges_personal`
  - `idx_toll_charges_late`
  - `idx_toll_charges_host_id`
  - `idx_trips_host_id`

## Final Integration Test ✅

### Test 19: Complete User Journey
- [ ] **User A Complete Flow**:
  - Sign up → Upload CSVs → Match tolls → Some personal tolls → Create invoice → Upload more CSVs → Late tolls detected → Create supplemental invoice
- [ ] **User B Complete Flow**: 
  - Same as User A but with different data
- [ ] **Verification**: Zero data overlap at any point

---

## Success Criteria Summary

✅ **Each logged-in user operates in a completely private bubble**
✅ **Uploads, matching, invoices, analytics run per-user only** 
✅ **Every page shows only that user's data**
✅ **Trips split into Completed/In Progress/Upcoming based on dates**
✅ **Unmatched tolls categorized as Personal**
✅ **Late-discovered tolls tracked per invoice**
✅ **Account switching shows zero stale cache bleed**
✅ **Multi-tenant database behaves like separate databases per user**

## Notes for Testing
- Use realistic CSV data with overlapping dates/plates between users
- Test on multiple browsers/devices simultaneously  
- Monitor network requests and database queries during testing
- Verify no JavaScript errors or console warnings during session switches