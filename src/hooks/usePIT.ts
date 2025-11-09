import { useState, useEffect } from 'react';
import { useFarcasterWallet } from './useFarcasterWallet';
import { useFarcasterSDK } from './useFarcasterSDK';
import { toast } from 'react-hot-toast';
import { useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

// Fetch EcionBatch contract address for token approvals
// NOTE: Users must approve the EcionBatch CONTRACT, not the backend wallet!
let ECION_BATCH_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';

const fetchBackendWalletAddress = async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/backend-wallet`);
    if (response.ok) {
      const data = await response.json();
      ECION_BATCH_CONTRACT_ADDRESS = data.address; // This is the contract address for approvals
      console.log('✅ EcionBatch contract address loaded:', ECION_BATCH_CONTRACT_ADDRESS);
      console.log('ℹ️ Users must approve tokens to the contract, not the backend wallet');
      return data.address;
    }
  } catch (error) {
    console.error('Failed to fetch contract address:', error);
  }
  return ECION_BATCH_CONTRACT_ADDRESS;
};

interface UserConfig {
  tokenAddress: string;
  likeAmount: string;
  replyAmount: string;
  recastAmount: string;
  followAmount: string;
  spendingLimit: string;
  audience: number;
  minFollowerCount: number;
  minNeynarScore: number;
  minSpamLabel?: number; // 0 = no filter, 1 = Level 1+, 2 = Level 2 only
  likeEnabled: boolean;
  replyEnabled: boolean;
  recastEnabled: boolean;
  followEnabled: boolean;
  isActive: boolean;
  totalSpent: string;
  tokenHistory?: string[];
  lastAllowance?: number | string;
  lastAllowanceCheck?: number;
}

export const useEcion = () => {
  const { address, isConnected } = useFarcasterWallet();
  const [userConfig, setUserConfig] = useState<UserConfig | null>(null);
  const [tokenBalance, setTokenBalance] = useState<any>(null);
  const [tokenAllowance, setTokenAllowance] = useState<string | null>(null);
  const [isAllowanceLoading, setIsAllowanceLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRevokingAllowance, setIsRevokingAllowance] = useState(false);
  const [isAddingMiniApp, setIsAddingMiniApp] = useState(false);
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  
  const { writeContract, data: txHash, isPending: isTxPending, error: txError } = useWriteContract();

  const normalizeAmountString = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) {
      return '0';
    }

    const num = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(num) || num === 0) {
      return '0';
    }

    const absolute = Math.abs(num);
    if (absolute >= 1) {
      return num.toString();
    }

    const fixed = num.toFixed(6);
    const trimmed = fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
    return trimmed === '-0' ? '0' : trimmed;
  };
  
  // Wait for transaction confirmation
  const { isLoading: isTxConfirming, isSuccess: isTxSuccess, isError: isTxError } = useWaitForTransactionReceipt({
    hash: pendingTxHash as `0x${string}`
  });

  // Handle transaction hash from writeContract
  useEffect(() => {
    if (txHash) {
      setPendingTxHash(txHash);
    }
  }, [txHash]);

  // Handle transaction success/failure with useEffect
  useEffect(() => {
    if (isTxSuccess && pendingTxHash) {
      console.log('✅ Transaction confirmed, updating allowance and webhooks...');
      
      toast.success('Transaction confirmed successfully!', { duration: 2000 });
      
      const tokenToRefresh = userConfig?.tokenAddress;
      if (tokenToRefresh) {
        console.log('🔄 Refreshing allowance immediately after confirmation');
        fetchTokenAllowance(tokenToRefresh, { force: true });
        updateAllowanceAndWebhooks(tokenToRefresh);
      }

      setPendingTxHash(null);
    }
    
    if (isTxError && pendingTxHash) {
      console.error('❌ Transaction failed');
      setPendingTxHash(null);
      toast.error('Transaction failed', { duration: 2000 });
    }
  }, [isTxSuccess, isTxError, pendingTxHash, userConfig?.tokenAddress]);

  useEffect(() => {
    if (address) {
      fetchUserConfig();
    }
    // Preload backend wallet address
    fetchBackendWalletAddress();
  }, [address]);

  // Note: Removed automatic allowance fetching to prevent unwanted webhook updates
  // Allowance will only be fetched when user explicitly performs approve/revoke actions

  const fetchUserConfig = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/config/${address}`);
      const data = await response.json();
        if (data.config && !Array.isArray(data.config.tokenHistory)) {
          data.config.tokenHistory = [];
        }
      setUserConfig(data.config);
    } catch (error) {
      console.error('Error fetching user config:', error);
    }
  };

  const setTippingConfig = async (configData: UserConfig) => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    setIsLoading(true);
    try {
      console.log('Saving config for address:', address);
      console.log('Config data:', configData);
      console.log('Backend URL:', BACKEND_URL);
      
      const response = await fetch(`${BACKEND_URL}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          config: configData
        })
      });
      
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Config saved successfully:', result);
        await fetchUserConfig(); // Refresh config
      } else {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        toast.error(`Failed to save configuration: ${response.status}`, { duration: 2000 });
      }
    } catch (error: any) {
      console.error('Error setting config:', error);
      toast.error('Failed to save configuration: ' + error.message, { duration: 2000 });
    }
    setIsLoading(false);
  };

  const approveToken = async (tokenAddress: string, amount: string) => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    // Validate minimum approval amount (1 USDC minimum)
    const amountNum = parseFloat(amount);
    if (tokenAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' && amountNum < 1) {
      toast.error('Minimum approval amount for USDC is 1 USDC', { duration: 2000 });
      return;
    }

    setIsApproving(true);
    try {
      // Check user balance before allowing approval
      const balanceResponse = await fetch(`${BACKEND_URL}/api/allowance-balance/${address}/${tokenAddress}`);
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        const userBalance = parseFloat(balanceData.balance);
        const approvalAmount = parseFloat(amount);
        
        if (userBalance < approvalAmount) {
          toast.error(`Insufficient balance. You have ${userBalance.toFixed(6)} tokens but trying to approve ${approvalAmount}`, { duration: 3000 });
          setIsApproving(false);
          return;
        }
        
        console.log(`✅ Balance check passed: ${userBalance} >= ${approvalAmount}`);
      }

      // Fetch the latest EcionBatch contract address
      const contractAddress = await fetchBackendWalletAddress();
      
      if (contractAddress === '0x0000000000000000000000000000000000000000') {
        toast.error('Contract address not available. Please try again.', { duration: 2000 });
        setIsApproving(false);
        return;
      }
      
      console.log('Approving EXACT amount:', amount, 'tokens to EcionBatch contract');
      console.log('EcionBatch contract address:', contractAddress);
      console.log('Token address:', tokenAddress);
      
      // Get token decimals from backend
      const tokenInfoResponse = await fetch(`${BACKEND_URL}/api/token-info/${tokenAddress}`);
      let tokenDecimals = 18; // Default
      if (tokenInfoResponse.ok) {
        const tokenInfo = await tokenInfoResponse.json();
        tokenDecimals = tokenInfo.decimals || 18;
      } else if (tokenAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') {
        tokenDecimals = 6; // USDC
      }
      
      console.log('Token decimals:', tokenDecimals);
      const amountWei = parseUnits(amount, tokenDecimals);
      
      writeContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": false,
            "inputs": [
              {"name": "_spender", "type": "address"},
              {"name": "_value", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"name": "", "type": "bool"}],
            "type": "function"
          }
        ],
        functionName: 'approve',
        args: [contractAddress as `0x${string}`, amountWei],
      });
      
      console.log('Approval transaction submitted');
      
    } catch (error: any) {
      console.error('Approval failed:', error);
      if (error.message?.includes('User rejected')) {
        toast.error('Transaction cancelled by user', { duration: 2000 });
      } else if (error.message?.includes('zero address')) {
        toast.error('EcionBatch contract address not configured. Please contact support.', { duration: 2000 });
      } else {
        toast.error('Failed to approve tokens: ' + error.message, { duration: 2000 });
      }
    }
    setIsApproving(false);
  };

  const revokeTokenAllowance = async (tokenAddress: string) => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    setIsRevokingAllowance(true);
    try {
      // Fetch the latest EcionBatch contract address
      const contractAddress = await fetchBackendWalletAddress();
      
      if (contractAddress === '0x0000000000000000000000000000000000000000') {
        toast.error('Contract address not available. Please try again.', { duration: 2000 });
        setIsRevokingAllowance(false);
        return;
      }
      
      console.log('Revoking allowance for token:', tokenAddress);
      console.log('Revoking from EcionBatch contract:', contractAddress);
      
      writeContract({
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            "constant": false,
            "inputs": [
              {"name": "_spender", "type": "address"},
              {"name": "_value", "type": "uint256"}
            ],
            "name": "approve",
            "outputs": [{"name": "", "type": "bool"}],
            "type": "function"
          }
        ],
        functionName: 'approve',
        args: [contractAddress as `0x${string}`, 0n],
      });
      
      console.log('Revoke transaction submitted');
      
      // Update allowance and webhooks after successful revocation
      await updateAllowanceAndWebhooks(tokenAddress, 'revocation');
      
    } catch (error: any) {
      console.error('Revocation failed:', error);
      if (error.message?.includes('User rejected')) {
        toast.error('Transaction cancelled by user', { duration: 2000 });
      } else if (error.message?.includes('zero address')) {
        toast.error('EcionBatch contract address not configured. Please contact support.', { duration: 2000 });
      } else {
        toast.error('Failed to revoke allowance: ' + error.message, { duration: 2000 });
      }
    }
    setIsRevokingAllowance(false);
  };

  const fetchTokenAllowance = async (tokenAddress: string, options: { force?: boolean } = {}) => {
    if (!address) return;
    const { force = false } = options;
    
    try {
      console.log('🔍 Fetching allowance for token:', tokenAddress);
      setIsAllowanceLoading(true);
      if (force) {
        setTokenAllowance(null);
      }

      const query = force ? '?force=true' : '';
      const response = await fetch(`${BACKEND_URL}/api/allowance/${address}/${tokenAddress}${query}`);
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Allowance response:', data);
        const normalized = normalizeAmountString(data.allowance);
        setTokenAllowance(normalized);
      } else if (response.status === 429 || response.status === 500) {
        console.warn(`⚠️ Allowance fetch rate-limited (${response.status}) - falling back to cached value`);
        if (userConfig?.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase()) {
          const cachedAllowance = userConfig.lastAllowance ?? '0';
          setTokenAllowance(normalizeAmountString(cachedAllowance));
        } else {
          setTokenAllowance('0');
        }
      } else {
        console.error('❌ Failed to fetch allowance:', response.status);
        setTokenAllowance('0');
      }
    } catch (error: any) {
      console.error('Error fetching token allowance:', error);
      const message = error?.message || '';
      if (message.includes('rate limit')) {
        if (userConfig?.tokenAddress?.toLowerCase() === tokenAddress.toLowerCase()) {
          const cachedAllowance = userConfig.lastAllowance ?? '0';
          setTokenAllowance(normalizeAmountString(cachedAllowance));
        } else {
          setTokenAllowance('0');
        }
      } else {
        setTokenAllowance('0');
      }
    } finally {
      setIsAllowanceLoading(false);
    }
  };

  // NEW: Update allowance and webhooks after transaction
  const updateAllowanceAndWebhooks = async (tokenAddress: string, transactionType: string = 'approval') => {
    if (!address) return;
    
    try {
      console.log('🔄 Updating allowance and webhooks for token:', tokenAddress);
      const response = await fetch(`${BACKEND_URL}/api/update-allowance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userAddress: address,
          tokenAddress: tokenAddress,
          transactionType: transactionType,
          isRealTransaction: true
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Allowance and webhooks updated:', data);
        const normalized = normalizeAmountString(data.allowance);
        setTokenAllowance(normalized);
          await fetchUserConfig();
        
        // Success message will be shown by transaction confirmation
      } else {
        console.error('❌ Failed to update allowance:', response.status);
        // Fallback to regular allowance fetch
        fetchTokenAllowance(tokenAddress, { force: true });
      }
    } catch (error) {
      console.error('Error updating allowance and webhooks:', error);
      // Fallback to regular allowance fetch
      fetchTokenAllowance(tokenAddress, { force: true });
    }
  };

  const revokeConfig = async () => {
    // This deactivates the user's tipping configuration
    if (!address) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/config/${address}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setUserConfig(null);
      }
    } catch (error) {
      console.error('Error revoking config:', error);
    }
  };

  const addMiniApp = async () => {
    if (typeof window === 'undefined') {
      toast.error('Mini app client not found. Please use Base App or Farcaster.');
      return;
    }

    try {
      setIsAddingMiniApp(true);
      
      // Check for Base App (Coinbase) first
      if ((window as any).farcaster) {
        await (window as any).farcaster.addMiniApp();
        toast.success('Mini app added successfully! You can now receive notifications.');
      } else {
        toast.error('Mini app client not found. Please use Base App or Farcaster.');
      }
    } catch (error) {
      console.error('Error adding mini app:', error);
      toast.error('Failed to add mini app. Please try again.');
    } finally {
      setIsAddingMiniApp(false);
    }
  };

  return {
    address,
    userConfig,
    tokenBalance,
    tokenAllowance,
    setTippingConfig,
    approveToken,
    revokeTokenAllowance,
    revokeConfig,
    fetchUserConfig,
    fetchTokenAllowance,
    updateAllowanceAndWebhooks,
    addMiniApp,
    isSettingConfig: isLoading,
    isApproving: isApproving || isTxPending || isTxConfirming,
    isRevokingAllowance: isRevokingAllowance || isTxPending || isTxConfirming,
    isAllowanceLoading,
    isAddingMiniApp: isAddingMiniApp,
    isUpdatingLimit: false,
    isRevoking: false,
    isTxSuccess,
    isTxConfirming,
  };
};

interface CastEmbed {
  url?: string;
  metadata?: any;
}

interface CastReactions {
  likes_count?: number;
  recasts_count?: number;
}

interface CastReplies {
  count?: number;
}

interface CastTipper {
  userAddress: string;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  fid?: number;
}

interface Cast {
  hash: string;
  text: string;
  timestamp: string;
  embeds?: CastEmbed[];
  reactions?: CastReactions;
  replies?: CastReplies;
  tipper?: CastTipper;
}

interface HomepageData {
  users: string[];
  amounts: string[];
  casts: Cast[];
}

interface LeaderboardUser {
  userAddress: string;
  totalAmount: number;
  tipCount: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
  fid?: number;
}

interface LeaderboardData {
  tippers: LeaderboardUser[];
  earners: LeaderboardUser[];
  users: string[];
  amounts: string[];
}

export const useHomepageData = (timeFilter: '24h' | '7d' | '30d' = '24h') => {
  const [homepageData, setHomepageData] = useState<HomepageData>({ users: [], amounts: [], casts: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    fetchHomepageData(1, true); // Reset to page 1 when timeFilter changes
  }, [timeFilter]);

  // No auto-refresh - only refresh when user changes time filter

  const fetchHomepageData = async (page: number = 1, reset: boolean = false) => {
    if (page === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/homepage?timeFilter=${timeFilter}&page=${page}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        
        if (reset || page === 1) {
          // Replace data for first page or reset
          setHomepageData({
            users: data.users || [],
            amounts: data.amounts || [],
            casts: data.casts || []
          });
        } else {
          // Append data for subsequent pages
          setHomepageData(prev => ({
            users: [...prev.users, ...(data.users || [])],
            amounts: [...prev.amounts, ...(data.amounts || [])],
            casts: [...prev.casts, ...(data.casts || [])]
          }));
        }
        
        setCurrentPage(page);
        setHasMore(data.pagination?.hasMore || false);
      }
    } catch (error) {
      console.error('Error fetching homepage data:', error);
      if (reset || page === 1) {
        setHomepageData({
          users: [],
          amounts: [],
          casts: []
        });
      }
    }
    
    setIsLoading(false);
    setIsLoadingMore(false);
  };

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      fetchHomepageData(currentPage + 1, false);
    }
  };

  return { 
    ...homepageData, 
    isLoading, 
    isLoadingMore,
    hasMore,
    loadMore,
    refetch: () => fetchHomepageData(1, true)
  };
};

export const useLeaderboardData = (timeFilter: '24h' | '7d' | '30d' = '24h') => {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData>({ 
    tippers: [], 
    earners: [], 
    users: [], 
    amounts: [] 
  });
  const [userStats, setUserStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  
  // Get current user FID from the hook
  const { currentUser: walletUser } = useFarcasterWallet();
  const { currentUser: sdkUser } = useFarcasterSDK();
  
  // Use SDK user if available, otherwise fall back to wallet user
  const currentUser = sdkUser || walletUser;
  const userFid = currentUser?.fid;
  
  console.log('🔍 usePIT user data:', { walletUser, sdkUser, currentUser, userFid });

  useEffect(() => {
    fetchLeaderboardData(1, true); // Reset to page 1 when timeFilter or userFid changes
  }, [timeFilter, userFid]);

  // No auto-refresh - only refresh when user changes time filter

  const fetchLeaderboardData = async (page: number = 1, reset: boolean = false) => {
    if (page === 1) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    
    try {
      
      const url = userFid 
        ? `${BACKEND_URL}/api/leaderboard?timeFilter=${timeFilter}&page=${page}&limit=10&userFid=${userFid}`
        : `${BACKEND_URL}/api/leaderboard?timeFilter=${timeFilter}&page=${page}&limit=10`;
        
      console.log('🔍 usePIT API call:', { userFid, url });
        
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        console.log('🔍 Leaderboard API response:', data);
        console.log('📊 User stats from API:', data.userStats);
        
        if (reset || page === 1) {
          // Replace data for first page or reset
          setLeaderboardData({
            tippers: data.tippers || [],
            earners: data.earners || [],
            users: data.users || [],
            amounts: data.amounts || []
          });
          setUserStats(data.userStats || null);
        } else {
          // Append data for subsequent pages
          setLeaderboardData(prev => ({
            tippers: [...prev.tippers, ...(data.tippers || [])],
            earners: [...prev.earners, ...(data.earners || [])],
            users: [...prev.users, ...(data.users || [])],
            amounts: [...prev.amounts, ...(data.amounts || [])]
          }));
        }
        
        setCurrentPage(page);
        setHasMore(data.pagination?.hasMore || false);
      }
    } catch (error) {
      console.error('Error fetching leaderboard data:', error);
      if (reset || page === 1) {
        setLeaderboardData({
          tippers: [],
          earners: [],
          users: [],
          amounts: []
        });
        setUserStats(null);
      }
    }
    
    setIsLoading(false);
    setIsLoadingMore(false);
  };

  const loadMore = () => {
    if (!isLoadingMore && hasMore) {
      fetchLeaderboardData(currentPage + 1, false);
    }
  };

  return { 
    ...leaderboardData, 
    userStats,
    isLoading, 
    isLoadingMore,
    hasMore,
    loadMore,
    refetch: () => fetchLeaderboardData(1, true)
  };
};