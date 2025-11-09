# Level 2 Farcaster User Check Implementation

## What is Level 2?

Level 2 in Farcaster refers to users who have verified their account and are considered "unlikely to engage in spammy behavior" according to Farcaster's spam detection system. The API returns this as `publicSpamLabel: "2 (unlikely to engage in spammy behavior)"`.

## API Response Structure

When you call `https://client.farcaster.xyz/v2/user?fid=230238`, you get:

```json
{
  "result": {
    "user": { ... },
    "extras": {
      "publicSpamLabel": "2 (unlikely to engage in spammy behavior)"
    }
  }
}
```

**Possible values:**
- `"2 (unlikely to engage in spammy behavior)"` - Level 2 ✅ (verified, safe)
- `"1 (likely to engage in spammy behavior)"` - Level 1 ❌ (not verified, potentially spam)
- `null` or missing - Unknown status

## Implementation Strategy

### Where to Check

You need to check the **interactor** (the person who liked/recasted/replied/followed), NOT the author. The author is the one paying tips, so they don't need to be Level 2.

**Check locations:**
1. **In `webhook.js`** - When processing webhook events (like, recast, reply, follow)
   - Check `interaction.interactorFid` before adding tip to queue
   - Location: After duplicate check, before tip validation

2. **In `batchTransferManager.js`** - Before executing tips
   - Double-check interactor Level 2 status before processing
   - Location: In `validateTip` or before `addTipToBatch`

### Implementation Steps

1. **Create a helper function** to check Level 2 status:
   ```javascript
   async function isLevel2User(fid) {
     try {
       const response = await fetch(`https://client.farcaster.xyz/v2/user?fid=${fid}`);
       const data = await response.json();
       const spamLabel = data?.result?.extras?.publicSpamLabel;
       
       // Level 2 = "2 (unlikely to engage in spammy behavior)"
       return spamLabel === "2 (unlikely to engage in spammy behavior)";
     } catch (error) {
       console.error(`Error checking Level 2 for FID ${fid}:`, error);
       // On error, default to allowing (don't block tips if API fails)
       return true;
     }
   }
   ```

2. **Add check in webhook.js** (around line 390-400, after duplicate check):
   ```javascript
   // Check if interactor is Level 2 user
   if (interaction.interactorFid) {
     const isLevel2 = await isLevel2User(interaction.interactorFid);
     if (!isLevel2) {
       console.log(`⏭️ Skipping tip - interactor FID ${interaction.interactorFid} is not Level 2`);
       return res.status(200).json({
         success: true,
         processed: false,
         reason: 'Interactor is not a Level 2 verified user'
       });
     }
   }
   ```

3. **Add check in batchTransferManager.js** (in tip validation, around line 330-350):
   ```javascript
   // Validate interactor is Level 2
   if (interaction.interactorFid) {
     const isLevel2 = await isLevel2User(interaction.interactorFid);
     if (!isLevel2) {
       console.log(`❌ Tip validation failed: Interactor FID ${interaction.interactorFid} is not Level 2`);
       return { valid: false, reason: 'Interactor is not a Level 2 verified user' };
     }
   }
   ```

### Caching Strategy

To avoid hitting the API for every tip, you can cache Level 2 status:
- Cache in memory (Map) with TTL (e.g., 24 hours)
- Or store in database `user_profiles` table with `is_level2` column
- Update cache when user's Level 2 status changes

### Error Handling

- **API fails**: Default to allowing tips (don't block if Farcaster API is down)
- **Rate limiting**: Add retry logic with exponential backoff
- **Invalid FID**: Skip check, allow tip (edge case)

### Performance Considerations

- **Async check**: Don't block webhook processing - check in parallel
- **Batch checking**: If processing multiple tips, batch the API calls
- **Cache aggressively**: Level 2 status rarely changes

## Impact

**Pros:**
- ✅ Reduces spam/low-quality engagement
- ✅ Only tips verified, legitimate users
- ✅ Improves tip quality and user experience

**Cons:**
- ⚠️ Adds API dependency (Farcaster client API)
- ⚠️ Slight delay in tip processing (API call)
- ⚠️ New users might not be Level 2 immediately

## Recommendation

1. **Start with webhook.js check** - Block at the source
2. **Add caching** - Store Level 2 status in database
3. **Monitor impact** - Track how many tips are blocked
4. **Add config option** - Let users enable/disable Level 2 requirement
