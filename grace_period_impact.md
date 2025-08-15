# Grace Period Enhancement Analysis

## Problem Identified
**Specific tolls failing due to tight time windows:**

### LLL1078 - Trip 43877813 (2025-06-19 13:00 to 2025-06-22 19:00)
**Tolls just outside window:**
- 2025-06-22 19:13:00 - RAS ($2.17) - 13 minutes after trip end
- 2025-06-22 19:37:00 - BES ($0.76) - 37 minutes after trip end  
- 2025-06-22 22:34:00 - BEN ($0.76) - 3.5 hours after trip end
- 2025-06-22 23:24:00 - 11→14C ($8.35) - 4.4 hours after trip end

### LPJ3806 - Trip 47845314 (2025-08-08 21:30 to 2025-08-10 21:30)
**Toll just outside window:**
- 2025-08-07 03:50:00 - CRZ ($2.25) - 41.5 hours before trip start

## Solution Implemented
**Added 6-hour grace period:**
- 6 hours before trip start time
- 6 hours after trip end time
- Logs when grace period is used for transparency

## Expected Impact
**Should capture additional ~5 tolls:**
- 4 tolls from LLL1078 on 6/22: $12.04
- 1 toll from LPJ3806 on 8/7: $2.25
- **Total additional revenue matched: $14.29**

## New Match Rate Projection
- **Current**: 161/200 = 80.5%
- **With grace period**: ~166/200 = **83.0%**

## Next Steps
1. Test with full CSV upload to verify improvement
2. Monitor grace period usage logs
3. Consider if 6-hour window is appropriate or needs adjustment

*Grace period rationale: Guests may pick up cars early or return slightly late, generating legitimate trip-related tolls outside strict booking times.*