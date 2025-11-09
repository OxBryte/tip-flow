# Allowance Check and User Restoration

## Summary

Added a new API endpoint to check token allowances for 23 FIDs and a specific address, and automatically restore users to active status if they have sufficient allowance and balance.

## What Was Done

### 1. New API Endpoint: `/api/check-allowances-and-restore`

**Location**: `backend-only/src/index.js`

**Purpose**: 
- Check token allowances and balances for 23 specific FIDs
- Check token allowance for specific address: `0x275aB0037e50BDA1cdA147e3Ac9AeaeFB3D21E85`
- Automatically add users back to webhook (`follow.created`) if they have sufficient funds

**The 23 FIDs Checked**:
```
249432, 15086, 250869, 564447, 1052964, 200375, 849116, 1161826,
520364, 1351395, 1007471, 1104000, 507756, 243108, 306502, 963470,
230238, 472963, 240486, 441699, 476026, 242597, 4163
```

**How It Works**:
1. For each FID:
   - Gets user address from database
   - Retrieves user config (token address, tip amounts)
   - Calculates `minTip` = `likeAmount + recastAmount + replyAmount`
   - Checks blockchain for allowance and balance
   - If `allowance >= minTip` AND `balance >= minTip` AND `allowance > 0`:
     - Adds FID to webhook's `follow.created.target_fids`
     - Sets `is_tracking = true` in database
     - User becomes active again ✅

2. For specific address `0x275aB0037e50BDA1cdA147e3Ac9AeaeFB3D21E85`:
   - Gets user config
   - Checks allowance and balance
   - If sufficient, tries to get FID and add back to webhook

**Response Format**:
```json
{
  "success": true,
  "message": "Allowance check completed",
  "summary": {
    "totalChecked": 24,
    "canAddBack": 10,
    "usersAddedBack": 10,
    "errors": 0,
    "currentActiveUsers": 15
  },
  "results": [
    {
      "fid": 249432,
      "userAddress": "0x...",
      "tokenAddress": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "allowance": 100.5,
      "balance": 150.0,
      "minTip": 1.0,
      "hasSufficientAllowance": true,
      "hasSufficientBalance": true,
      "canAddBack": true,
      "status": "ready"
    },
    // ... more results
  ],
  "usersAddedBack": [
    {
      "fid": 249432,
      "userAddress": "0x...",
      "allowance": 100.5,
      "balance": 150.0,
      "minTip": 1.0
    }
    // ... more users added back
  ],
  "currentTrackedFidsCount": 15
}
```

### 2. Standalone Script: `check-allowances.js`

**Location**: `backend-only/check-allowances.js`

**Purpose**: 
- Can be run independently to check allowances without modifying webhook
- Useful for debugging and manual checks
- Doesn't require the server to be running

**Usage**:
```bash
cd backend-only
node check-allowances.js
```

**Note**: Requires database connection and environment variables to be set.

## Active Users Logic (Recap)

### What Are Active Users?

**Active Users** = Users in `follow.created.target_fids` webhook filter

### Criteria for Active User:
1. ✅ User has approved token allowance to EcionBatch contract (`allowance > 0`)
2. ✅ `allowance >= minTip` (where `minTip = likeAmount + recastAmount + replyAmount`)
3. ✅ `balance >= minTip` (user has enough token balance)
4. ✅ User is in `webhook_config.tracked_fids` database table
5. ✅ User has `is_tracking = true` in `user_profiles` table

### When Users Get Removed:

Users are automatically removed from active status if:
- `allowance < minTip` (insufficient allowance)
- `balance < minTip` (insufficient balance)
- Error checking allowance/balance

This happens in the `getActiveUsers()` function which runs every 2 minutes via polling.

### When Users Get Added:

Users are automatically added when:
- User approves token allowance via frontend (`/api/update-allowance`)
- Backend checks and finds `allowance >= minTip` AND `balance >= minTip`
- `addFidToWebhook(fid)` is called
- FID is added to `follow.created.target_fids`
- Database updated: `is_tracking = true`

## How to Use

### Check Allowances and Restore Users

**Production**:
```bash
curl https://tippit-production.up.railway.app/api/check-allowances-and-restore
```

**Local**:
```bash
curl http://localhost:3001/api/check-allowances-and-restore
```

### Manual Script (If Needed)

```bash
cd backend-only
node check-allowances.js
```

## What This Endpoint Does NOT Do

- ❌ Does NOT remove any existing logic
- ❌ Does NOT change how `getActiveUsers()` works
- ❌ Does NOT modify the polling mechanism
- ❌ Does NOT change webhook structure
- ✅ ONLY adds users back if they have sufficient funds
- ✅ ONLY provides information about allowances

## Important Notes

1. **No Logic Changes**: All existing logic remains unchanged. This endpoint only:
   - Checks allowances
   - Adds users back if they qualify
   - Provides diagnostic information

2. **Automatic Restoration**: Users are automatically added back if they meet the criteria. No manual intervention needed after running the endpoint.

3. **Current Active Users**: After running, check `currentTrackedFidsCount` in the response to see how many active users are in the webhook.

4. **Specific Address**: The address `0x275aB0037e50BDA1cdA147e3Ac9AeaeFB3D21E85` is checked separately. If it has sufficient allowance and a FID can be found, it will also be added back.

## Testing

To test the endpoint:

1. Make sure backend is running
2. Call the endpoint: `GET /api/check-allowances-and-restore`
3. Check the response for:
   - `summary.usersAddedBack`: Number of users successfully restored
   - `results`: Detailed information about each checked user
   - `currentTrackedFidsCount`: Current active user count

## Troubleshooting

If users are not being added back:

1. Check `results` array for each user:
   - `hasSufficientAllowance`: Should be `true`
   - `hasSufficientBalance`: Should be `true`
   - `canAddBack`: Should be `true`

2. Check for errors in `errors` array

3. Verify:
   - User has config in database
   - User has address in `user_profiles`
   - Token address is correct
   - MinTip is calculated correctly
   - Blockchain RPC is working

## Related Files

- `backend-only/src/index.js` - Main backend file with endpoint
- `backend-only/check-allowances.js` - Standalone checking script
- `WEBHOOK_SOURCE_OF_TRUTH.md` - Webhook implementation details
- `WEBHOOK_STRUCTURE.md` - Webhook structure explanation

## Commit Info

**Commit**: `ae14e1ca`  
**Branch**: `main`  
**Date**: 2025-01-30

**Changes**:
- Added `/api/check-allowances-and-restore` endpoint
- Created `check-allowances.js` script
- No breaking changes to existing functionality
