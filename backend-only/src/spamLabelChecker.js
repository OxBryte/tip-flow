/**
 * Check Farcaster user spam label (Level 0, 1, or 2)
 * Level 2 = "2 (unlikely to engage in spammy behavior)" - verified, safe users
 * Level 1 = "1 (likely to engage in spammy behavior)" - potentially spam
 * Level 0 = null or missing - unknown status
 */

// Cache spam labels to avoid hitting API repeatedly
const spamLabelCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get spam label for a FID from Farcaster client API
 * @param {number} fid - Farcaster FID
 * @returns {Promise<number|null>} - Spam label (0, 1, 2) or null if unknown/error
 */
async function getSpamLabel(fid) {
  try {
    // Check cache first
    const cached = spamLabelCache.get(fid);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.label;
    }

    // Fetch from API
    const response = await fetch(`https://client.farcaster.xyz/v2/user?fid=${fid}`, {
      headers: {
        'User-Agent': 'Ecion-Tipping-Bot/1.0'
      }
    });

    if (!response.ok) {
      console.log(`⚠️ Failed to fetch spam label for FID ${fid}: ${response.status}`);
      return null; // Default to allowing if API fails
    }

    const data = await response.json();
    const spamLabelText = data?.result?.extras?.publicSpamLabel;

    // Parse spam label: "2 (unlikely to engage in spammy behavior)" -> 2
    let spamLabel = null;
    if (spamLabelText) {
      const match = spamLabelText.match(/^(\d+)/);
      if (match) {
        spamLabel = parseInt(match[1], 10);
      }
    }

    // Cache the result
    spamLabelCache.set(fid, {
      label: spamLabel,
      timestamp: Date.now()
    });

    console.log(`🔍 Spam label for FID ${fid}: ${spamLabel} (${spamLabelText || 'unknown'})`);
    return spamLabel;
  } catch (error) {
    console.error(`❌ Error checking spam label for FID ${fid}:`, error.message);
    // On error, default to allowing (don't block tips if API fails)
    return null;
  }
}

/**
 * Check if user meets minimum spam label requirement
 * @param {number} fid - Farcaster FID to check
 * @param {number} minSpamLabel - Minimum required spam label (0, 1, or 2)
 * @returns {Promise<boolean>} - True if user meets requirement
 */
async function meetsSpamLabelRequirement(fid, minSpamLabel) {
  // If no requirement set (null/undefined), allow all users
  if (minSpamLabel === null || minSpamLabel === undefined) {
    return true;
  }

  // If requirement is 0, allow all users (no filter)
  if (minSpamLabel === 0) {
    return true;
  }

  const userSpamLabel = await getSpamLabel(fid);

  // If we couldn't get spam label (API error), default to allowing
  if (userSpamLabel === null) {
    console.log(`⚠️ Could not determine spam label for FID ${fid} - allowing by default`);
    return true;
  }

  // User must have spam label >= minimum requirement
  // Level 2 >= Level 1 >= Level 0
  const meetsRequirement = userSpamLabel >= minSpamLabel;

  if (!meetsRequirement) {
    console.log(`❌ FID ${fid} spam label ${userSpamLabel} < required ${minSpamLabel}`);
  }

  return meetsRequirement;
}

/**
 * Clear cache for a specific FID (useful for testing or forced refresh)
 */
function clearSpamLabelCache(fid) {
  if (fid) {
    spamLabelCache.delete(fid);
  } else {
    spamLabelCache.clear();
  }
}

module.exports = {
  getSpamLabel,
  meetsSpamLabelRequirement,
  clearSpamLabelCache
};
