// Backend-only system - no smart contracts needed
// This file is kept for compatibility but will be removed in future updates

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// USDC on Base for reference
export const USDC_BASE = {
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  symbol: 'USDC',
  decimals: 6,
  name: 'USD Coin'
};

// Helper function to format amounts (no longer needed with backend-only)
export const formatAmount = (amount: string | number | null | undefined): string => {
  if (amount === null || amount === undefined) {
    return '0';
  }

  const num = typeof amount === 'number' ? amount : Number(amount);

  if (!Number.isFinite(num)) {
    return typeof amount === 'string' ? amount : '0';
  }

  if (num === 0) {
    return '0';
  }

  const absolute = Math.abs(num);

  if (absolute < 0.000001) {
    return '<0.000001';
  }

  return num.toLocaleString('en-US', {
    minimumFractionDigits: absolute >= 1 ? 0 : 2,
    maximumFractionDigits: 6
  });
};