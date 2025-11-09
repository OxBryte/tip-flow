# Webhook as Source of Truth - Implementation

## 🎯 Problem Statement

**You said:**
> "the 23 fids are already in the webhook follow.created filter ... but they are not in active user the active user is 0 ... the follow.created fid users are the active users now onwards"

**The Issue:**
- 23 FIDs were already added to webhook's `follow.created.target_fids` ✅
- But system was showing 0 active users ❌
- System was reading from database `is_tracking` column instead of webhook ❌

## ✅ Solution Implemented

### Changed Source of Truth

**BEFORE** (WRONG):
```javascript
async function getActiveUsers() {
  // Read from database is_tracking column ❌
  const result = await database.pool.query(`
    SELECT * FROM user_profiles 
    WHERE is_tracking = true
  `);
}
```

**AFTER** (CORRECT):
```javascript
async function getActiveUsers() {
  // Read from webhook config (source of truth) ✅
  const trackedFids = await database.getTrackedFids();
  
  // Get user data for FIDs in webhook
  const result = await database.pool.query(`
    SELECT * FROM user_profiles 
    WHERE fid = ANY($1)
  `, [trackedFids]);
}
```

### What database.getTrackedFids() Does

```javascript
// In database-pg.js
async getTrackedFids() {
  const result = await this.pool.query(`
    SELECT tracked_fids 
    FROM webhook_config 
    ORDER BY updated_at DESC 
    LIMIT 1
  `);
  return result.rows[0]?.tracked_fids || [];
}
```

This reads from the `webhook_config` table which stores the FIDs that are in webhook's `follow.created.target_fids`.

## 🔧 How to Sync the 23 FIDs

### Option 1: API Endpoint (Once Railway Deploys)

```bash
curl https://tippit-production.up.railway.app/api/sync-webhook-fids
```

This endpoint:
1. ✅ Adds 23 FIDs to `webhook_config.tracked_fids` 
2. ✅ Sets `is_tracking=true` for all 23 users
3. ✅ Returns the total count

### Option 2: Direct SQL (Immediate)

Run this in Railway Database → Query tab:

```sql
-- Get current webhook_id
SELECT webhook_id, tracked_fids 
FROM webhook_config 
ORDER BY updated_at DESC 
LIMIT 1;

-- Update tracked_fids with the 23 FIDs
UPDATE webhook_config
SET 
  tracked_fids = ARRAY[
    249432, 15086, 250869, 564447, 1052964, 200375, 849116, 1161826,
    520364, 1351395, 1007471, 1104000, 507756, 243108, 306502, 963470,
    230238, 472963, 240486, 441699, 476026, 242597, 4163
  ],
  updated_at = NOW()
WHERE webhook_id = (
  SELECT webhook_id 
  FROM webhook_config 
  ORDER BY updated_at DESC 
  LIMIT 1
);

-- Also set is_tracking=true for these users
UPDATE user_profiles 
SET is_tracking = true, updated_at = NOW()
WHERE fid IN (
  249432, 15086, 250869, 564447, 1052964, 200375, 849116, 1161826,
  520364, 1351395, 1007471, 1104000, 507756, 243108, 306502, 963470,
  230238, 472963, 240486, 441699, 476026, 242597, 4163
);

-- Verify
SELECT COUNT(*) as active_users_count
FROM user_profiles
WHERE fid = ANY(
  SELECT tracked_fids 
  FROM webhook_config 
  ORDER BY updated_at DESC 
  LIMIT 1
);
```

## 📊 System Flow After Fix

### 1. Polling Cycle (Every 2 Minutes)

```javascript
// pollLatestCasts() calls getActiveUsers()
const activeUsers = await getActiveUsers();

// getActiveUsers() flow:
1. const trackedFids = await database.getTrackedFids(); 
   // ← Reads 23 FIDs from webhook_config.tracked_fids
   
2. Query user_profiles WHERE fid IN trackedFids
   // ← Gets user data for all 23 FIDs
   
3. For each user:
   - Check allowance >= minTip
   - Check balance >= minTip
   
4. If sufficient funds:
   - Keep in active list ✅
   
5. If insufficient funds:
   - removeUserFromTracking() ❌
   - Removes from webhook follow.created
   - Removes cast hash from cast/reaction tracking
```

### 2. Active User Determination

```
┌─────────────────────────────────────────┐
│   webhook_config.tracked_fids           │
│   (Source of Truth)                     │
│                                         │
│   [249432, 15086, 250869, ...]         │
│         ↓                               │
│   These ARE the active users            │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│   getActiveUsers()                      │
│   - Reads FIDs from webhook_config      │
│   - Checks allowance & balance          │
│   - Returns users with sufficient funds │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│   Poll latest casts for these users     │
│   Update webhook filters                │
└─────────────────────────────────────────┘
```

### 3. Adding a User

```javascript
// When user approves allowance
addFidToWebhook(fid) {
  1. Get current trackedFids from database
  2. Add new FID to array
  3. Update Neynar webhook's follow.created
  4. Save to database: setTrackedFids([...fids, newFid])
}
```

### 4. Removing a User

```javascript
// When allowance/balance insufficient
removeFidFromWebhook(fid) {
  1. Get current trackedFids from database
  2. Remove FID from array
  3. Get user's latest_cast_hash
  4. Remove cast hash from cast/reaction tracking
  5. Update Neynar webhook (follow.created + cast tracking)
  6. Save to database: setTrackedFids(fids.filter(f => f !== fid))
}
```

## ✅ Result

Now when you check:
```bash
curl https://tippit-production.up.railway.app/api/tracked-fids
```

You'll see:
```json
{
  "success": true,
  "trackedFids": [249432, 15086, 250869, ...],  // ← 23 FIDs
  "webhookId": "01K6EFR9566V9A7CQ7GEQZ5C3Q"
}
```

And logs will show:
```
👥 Found 23 FIDs in webhook follow.created (active users)
📋 Found 23 users in database for 23 FIDs
✅ ACTIVE: 0x... (FID: 249432) - allowance: 10, balance: 10, minTip: 1
✅ ACTIVE: 0x... (FID: 15086) - allowance: 5, balance: 5, minTip: 1
...
🎯 Found X truly active users out of 23 FIDs in follow.created
```

## 🎯 Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Source of Truth** | Database `is_tracking` column ❌ | `webhook_config.tracked_fids` ✅ |
| **Active Users** | WHERE `is_tracking=true` | WHERE `fid IN trackedFids` |
| **23 FIDs Recognition** | Not recognized (0 active) ❌ | Recognized as active ✅ |
| **System Behavior** | Out of sync with webhook | In sync with webhook |

**Now the system reads from `follow.created` (via webhook_config.tracked_fids) to determine active users!** ✅
