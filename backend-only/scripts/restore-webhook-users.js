#!/usr/bin/env node
/**
 * Restore specific Farcaster FIDs to the follow.created webhook after allowance-check failures.
 *
 * Usage:
 *   node scripts/restore-webhook-users.js 13505 264187
 *
 * Requirements:
 *   - DATABASE_URL
 *   - NEYNAR_API_KEY
 *   - (optional) BASE_RPC_URL / INFURA_BASE_RPC_URL / QUICKNODE_BASE_RPC_URL
 *
 * The script verifies allowance and balance for each user before re-adding them.
 */

require('dotenv').config();

const { ethers } = require('ethers');
const database = require('../src/database-pg');
const { executeWithFallback } = require('../src/rpcProvider');
const { addFidToWebhook } = require('../src/index');

const BASE_USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const ECION_BATCH_ADDRESS = process.env.ECION_BATCH_CONTRACT_ADDRESS || '0x2f47bcc17665663d1b63e8d882faa0a366907bb8';

const TOKEN_DECIMALS = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6, // USDC
  '0x4200000000000000000000000000000000000006': 18, // WETH
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': 18, // DAI
  '0x940181a94a35a4569e4529a3cdfb74e38fd98631': 18 // AERO
};

function usage() {
  console.error('Usage: node scripts/restore-webhook-users.js <fid> [<fid> ...]');
  console.error('Example: node scripts/restore-webhook-users.js 13505 264187');
  process.exit(1);
}

function parseFids(argv) {
  return argv
    .map(value => parseInt(value, 10))
    .filter(Number.isFinite);
}

function parseEnabled(value) {
  return value === true || value === 'true' || value === 1;
}

function parseAmount(value) {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

async function getAllowanceAndBalance(tokenAddress, userAddress) {
  const decimals = TOKEN_DECIMALS[tokenAddress.toLowerCase()] || 18;

  const [allowance, balance] = await executeWithFallback(async (provider) => {
    const tokenContract = new ethers.Contract(tokenAddress, [
      'function allowance(address owner, address spender) view returns (uint256)',
      'function balanceOf(address owner) view returns (uint256)'
    ], provider);

    return Promise.all([
      tokenContract.allowance(userAddress, ECION_BATCH_ADDRESS),
      tokenContract.balanceOf(userAddress)
    ]);
  }, 4);

  return {
    allowance: parseFloat(ethers.formatUnits(allowance, decimals)),
    balance: parseFloat(ethers.formatUnits(balance, decimals))
  };
}

async function loadUserProfiles(fids) {
  const result = await database.pool.query(`
    SELECT 
      up.fid,
      LOWER(up.user_address) AS user_address,
      up.username,
      up.display_name,
      up.latest_cast_hash,
      uc.config
    FROM user_profiles up
    LEFT JOIN user_configs uc ON LOWER(uc.user_address) = LOWER(up.user_address)
    WHERE up.fid = ANY($1::bigint[])
  `, [fids]);

  return result.rows;
}

async function main() {
  const fids = parseFids(process.argv.slice(2));
  if (!fids.length) {
    usage();
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is required to restore users.');
    process.exit(1);
  }
  if (!process.env.NEYNAR_API_KEY) {
    console.error('❌ NEYNAR_API_KEY is required to update webhook subscriptions.');
    process.exit(1);
  }

  console.log(`🔄 Restoring ${fids.length} users...`);

  try {
    const profiles = await loadUserProfiles(fids);
    if (!profiles.length) {
      console.log('⚠️ No matching user profiles found for provided FIDs.');
      process.exit(0);
    }

    const eligibleUsers = [];

    for (const profile of profiles) {
      if (!profile.user_address) {
        console.log(`⚠️ FID ${profile.fid}: missing verified address, skipping.`);
        continue;
      }

      let config = profile.config;
      if (typeof config === 'string') {
        try {
          config = JSON.parse(config);
        } catch (error) {
          console.log(`⚠️ FID ${profile.fid}: failed to parse config JSON.`, error.message);
          config = null;
        }
      }

      const normalizedToken = (config?.tokenAddress || BASE_USDC_ADDRESS).toLowerCase();
      const likeEnabled = parseEnabled(config?.likeEnabled);
      const recastEnabled = parseEnabled(config?.recastEnabled);
      const replyEnabled = parseEnabled(config?.replyEnabled);

      const likeAmount = parseAmount(config?.likeAmount);
      const recastAmount = parseAmount(config?.recastAmount);
      const replyAmount = parseAmount(config?.replyAmount);

      const minTip = 
        (likeEnabled ? likeAmount : 0) +
        (recastEnabled ? recastAmount : 0) +
        (replyEnabled ? replyAmount : 0);

      if (minTip <= 0) {
        console.log(`⚠️ FID ${profile.fid}: no enabled tip amounts configured, skipping.`);
        continue;
      }

      try {
        const { allowance, balance } = await getAllowanceAndBalance(normalizedToken, profile.user_address);

        console.log(`📊 FID ${profile.fid}: allowance=${allowance}, balance=${balance}, minTip=${minTip}`);

        if (allowance >= minTip && balance >= minTip) {
          eligibleUsers.push({
            fid: profile.fid,
            userAddress: profile.user_address,
            config: config ? { ...config, isActive: true } : null,
            tokenAddress: normalizedToken,
            allowance,
            balance,
            minTip
          });
        } else {
          console.log(`⚠️ FID ${profile.fid}: insufficient allowance/balance. Skipping re-add.`);
        }
      } catch (error) {
        console.log(`❌ FID ${profile.fid}: failed to fetch allowance/balance - ${error.message}`);
      }
    }

    if (!eligibleUsers.length) {
      console.log('⚠️ No users met the allowance/balance requirements. Nothing to restore.');
      process.exit(0);
    }

    const eligibleFids = eligibleUsers.map(user => user.fid);

    await database.pool.query(`
      UPDATE user_profiles
      SET is_tracking = true, updated_at = NOW()
      WHERE fid = ANY($1::bigint[])
    `, [eligibleFids]);

    for (const user of eligibleUsers) {
      if (user.config) {
        await database.setUserConfig(user.userAddress, user.config);
      }
    }

    for (const user of eligibleUsers) {
      try {
        const added = await addFidToWebhook(user.fid);
        console.log(`${added ? '✅' : '⚠️'} FID ${user.fid}: webhook ${added ? 'updated' : 'not updated'}`);
      } catch (error) {
        console.log(`❌ FID ${user.fid}: failed to update webhook - ${error.message}`);
      }
    }

    console.log(`🎉 Restoration complete for ${eligibleUsers.length} user(s).`);
  } catch (error) {
    console.error('❌ Restoration failed:', error);
    process.exitCode = 1;
  } finally {
    if (database?.pool) {
      await database.pool.end().catch(() => {});
    }
  }
}

main();
