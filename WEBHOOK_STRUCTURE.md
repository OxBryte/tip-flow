# Webhook Structure & Active User Management

## 🎯 Webhook Structure

The Neynar webhook subscription has **3 event types**, each serving a specific purpose:

### 1. **`follow.created`** - Active Users List
```json
{
  "follow.created": {
    "target_fids": [249432, 15086, 250869, ...]  // Array of active user FIDs
  }
}
```
- **Purpose**: Track follows of active users
- **Contains**: FIDs of users with sufficient allowance & balance
- **This is the authoritative list of "Active Users"**

### 2. **`cast.created`** - Reply Tracking
```json
{
  "cast.created": {
    "parent_hashes": ["0xabc123...", "0xdef456...", ...]  // Latest cast hashes
  }
}
```
- **Purpose**: Track replies to active users' latest casts
- **Contains**: Latest cast hash for each active user

### 3. **`reaction.created`** - Like/Recast Tracking
```json
{
  "reaction.created": {
    "target_cast_hashes": ["0xabc123...", "0xdef456...", ...]  // Latest cast hashes
  }
}
```
- **Purpose**: Track likes and recasts on active users' latest casts
- **Contains**: Same cast hashes as `cast.created`

---

## 👥 Active User Definition

**Active Users** = Users in `follow.created.target_fids`

A user is active when:
- ✅ `allowance > 0` (approved tokens to EcionBatch contract)
- ✅ `allowance >= minTip` (enough allowance for at least one tip)
- ✅ `balance >= minTip` (enough token balance for at least one tip)
- ✅ `is_tracking = true` in database
- ✅ `isActive = true` in user config

---

## 🔄 User Lifecycle

### Adding a User (When Approving Allowance)

1. User approves tokens on frontend
2. Frontend calls `/api/update-allowance`
3. Backend checks allowance & balance
4. If sufficient → `addFidToWebhook(fid)`
5. **FID added to `follow.created.target_fids`**
6. User's latest cast added to `cast.created` & `reaction.created`
7. Database: `is_tracking = true`

### Removing a User (Insufficient Funds)

1. Backend polls every 2 minutes via `getActiveUsers()`
2. Checks each user's allowance & balance
3. If `allowance < minTip` OR `balance < minTip`:
   - `removeUserFromTracking(userAddress, fid)` called
   - **FID removed from `follow.created.target_fids`**
   - **User's cast hash removed from `cast.created` & `reaction.created`**
   - Database: `is_tracking = false`
   - If `balance < minTip` → Auto-revoke allowance

---

## 📝 Key Functions

### `addFidToWebhook(fid)`
```javascript
// Adds FID to follow.created (active users)
// Gets all latest cast hashes
// Updates webhook with:
//   - follow.created.target_fids = [...existingFids, newFid]
//   - cast.created.parent_hashes = [all latest casts]
//   - reaction.created.target_cast_hashes = [all latest casts]
```

### `removeFidFromWebhook(fid)`
```javascript
// 1. Remove FID from follow.created (active users)
// 2. Get user's latest_cast_hash from database
// 3. Remove that cast hash from cast.created & reaction.created
// 4. Update webhook with cleaned arrays
```

### `removeUserFromTracking(userAddress, fid)`
```javascript
// 1. Set is_tracking=false in database
// 2. Call removeFidFromWebhook(fid)
//    - FID removed from follow.created
//    - Cast hash removed from cast/reaction tracking
```

### `getActiveUsers()`
```javascript
// Called every 2 minutes by polling
// For each user with is_tracking=true:
//   1. Calculate minTip (like + recast + reply amounts)
//   2. Check allowance & balance from blockchain
//   3. If insufficient → removeUserFromTracking()
//   4. If sufficient → keep in active list
// Returns: Array of truly active users
```

---

## 🚨 Restoring the 23 Deleted Users

### Method 1: SQL Script (Fastest) ⚡
```sql
-- Run this in Railway Database → Query tab
-- File: backend-only/restore-users.sql

UPDATE user_profiles 
SET is_tracking = true, updated_at = NOW()
WHERE fid IN (
  249432, 15086, 250869, 564447, 1052964, 200375, 849116, 1161826,
  520364, 1351395, 1007471, 1104000, 507756, 243108, 306502, 963470,
  230238, 472963, 240486, 441699, 476026, 242597, 4163
);
```

After running:
- Backend will poll and check funds
- Users with sufficient funds → Added to `follow.created`
- Users without funds → Removed again automatically

### Method 2: Node Script
```bash
# SSH into Railway backend
cd backend-only
node restore-users.js
```

### Method 3: API Endpoint
```bash
curl https://tippit-production.up.railway.app/api/restore-deleted-users
```

---

## 🔍 Verifying Active Users

### Check Database
```sql
SELECT fid, user_address, username, is_tracking
FROM user_profiles
WHERE is_tracking = true;
```

### Check Webhook Config
```sql
SELECT tracked_fids
FROM webhook_config
ORDER BY updated_at DESC
LIMIT 1;
```

### Check Logs
Look for:
```
✅ ACTIVE: <address> (FID: <fid>) - allowance: X, balance: Y, minTip: Z
🚫 REMOVING: <address> (FID: <fid>) - allowance: X, balance: Y, minTip: Z
```

---

## 📊 Summary

| Webhook Event | Purpose | Contains |
|--------------|---------|----------|
| `follow.created.target_fids` | **Active Users** | FIDs with sufficient funds |
| `cast.created.parent_hashes` | Reply tracking | Latest cast hashes |
| `reaction.created.target_cast_hashes` | Like/Recast tracking | Latest cast hashes |

**The single source of truth for active users is `follow.created.target_fids`** ✅
