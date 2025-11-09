import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useEcion } from '@/hooks/usePIT';
import { formatAmount } from '@/utils/contracts';
import toast from 'react-hot-toast';
import { useRouter } from 'next/router';
import {
  DollarSign,
  Shield,
  Users,
  Heart,
  MessageCircle,
  Repeat,
  UserPlus,
  Check,
  X,
  ChevronDown,
} from 'lucide-react';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
const BASE_USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const DEFAULT_TIP_AMOUNTS: Record<'like' | 'reply' | 'recast' | 'follow', string> = {
  like: '0.005',
  reply: '0.025',
  recast: '0.025',
  follow: '0',
};

export default function Settings() {
  const {
    address,
    userConfig,
    tokenBalance,
    tokenAllowance,
    isAllowanceLoading,
    setTippingConfig,
    approveToken,
    revokeTokenAllowance,
    revokeConfig,
    fetchTokenAllowance,
    addMiniApp,
    isSettingConfig,
    isApproving,
    isRevokingAllowance,
    isAddingMiniApp,
    isUpdatingLimit,
    isRevoking,
    isTxSuccess,
    isTxConfirming,
  } = useEcion();

  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'amounts' | 'criteria' | 'allowance'>('allowance');
  const [pendingConfigSave, setPendingConfigSave] = useState(false);
  
    // Form states
    const [allowanceAmount, setAllowanceAmount] = useState('');
    const [selectedToken, setSelectedToken] = useState(''); // Will be set from userConfig
    const [customTokenAddress, setCustomTokenAddress] = useState('');
    const [selectedTokenLabel, setSelectedTokenLabel] = useState('USDC');
    const [tokenLabels, setTokenLabels] = useState<Record<string, string>>({
      [BASE_USDC_ADDRESS]: 'USDC',
    });
  const [tokenHistory, setTokenHistory] = useState<string[]>([]);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [isValidToken, setIsValidToken] = useState(true);
  const [amountErrors, setAmountErrors] = useState<{[key: string]: string}>({});
  const [isApprovingLocal, setIsApprovingLocal] = useState(false);
  const [isRevokingLocal, setIsRevokingLocal] = useState(false);
  const [displayAllowance, setDisplayAllowance] = useState<string>('0');
  const [allowanceCache, setAllowanceCache] = useState<Record<string, string>>({});

  const normalizeAllowance = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '0';
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num) || num === 0) return '0';
    const absolute = Math.abs(num);
    if (absolute >= 1) return num.toString();
    const fixed = num.toFixed(6);
    const trimmed = fixed.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
    return trimmed === '-0' ? '0' : trimmed;
  };
  
  // Validate tip amount (minimum $0.005)
  const validateAmount = (value: string, key: string) => {
    const numValue = parseFloat(value);
    if (numValue < 0.005) {
      setAmountErrors(prev => ({ ...prev, [key]: 'Must be $0.005 or more' }));
      return false;
    } else {
      setAmountErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
      return true;
    }
  };
  
    const [tippingAmounts, setTippingAmounts] = useState({
      like: DEFAULT_TIP_AMOUNTS.like,
      reply: DEFAULT_TIP_AMOUNTS.reply,
      recast: DEFAULT_TIP_AMOUNTS.recast,
      follow: DEFAULT_TIP_AMOUNTS.follow,
    });
  const [tippingToggles, setTippingToggles] = useState({
    like: false,
    reply: false,
    recast: false,
    follow: false,
  });
const [criteria, setCriteria] = useState({
    audience: 0, // 0: Following, 1: Followers, 2: Anyone
    minFollowerCount: 25,
    minNeynarScore: 0.5,
    minSpamLabel: 0, // 0: No filter, 1: Level 1+, 2: Level 2 only
  });
  
  const allowanceValue = Number(displayAllowance ?? '0');
  const hasAllowanceValue = !Number.isNaN(allowanceValue);

  // Handle transaction success - redirect to amounts tab
  useEffect(() => {
    if (isTxSuccess && !isTxConfirming && activeTab === 'allowance') {
      // Wait a bit then smoothly switch to amounts tab
      setTimeout(() => {
        setActiveTab('amounts');
      }, 1500);
    }
  }, [isTxSuccess, isTxConfirming, activeTab]);

  // Handle config save success - redirect to criteria tab
  useEffect(() => {
    if (pendingConfigSave && !isSettingConfig) {
      // Config was saved successfully, move to criteria tab
      setTimeout(() => {
        setActiveTab('criteria');
        setPendingConfigSave(false);
      }, 1500);
    }
  }, [pendingConfigSave, isSettingConfig]);

  // Check if user came from homepage after approval (via query param)
  useEffect(() => {
    if (router.query.from === 'approval') {
      setActiveTab('amounts');
    }
  }, [router.query]);

    useEffect(() => {
      setMounted(true);
    if (userConfig) {
        setTippingAmounts({
          like: userConfig.likeEnabled ? userConfig.likeAmount?.toString() || DEFAULT_TIP_AMOUNTS.like : '0',
          reply: userConfig.replyEnabled ? userConfig.replyAmount?.toString() || DEFAULT_TIP_AMOUNTS.reply : '0',
          recast: userConfig.recastEnabled ? userConfig.recastAmount?.toString() || DEFAULT_TIP_AMOUNTS.recast : '0',
          follow: userConfig.followEnabled ? userConfig.followAmount?.toString() || DEFAULT_TIP_AMOUNTS.follow : '0',
        });
        setTippingToggles({
          like: userConfig.likeEnabled ?? false,
          reply: userConfig.replyEnabled ?? false,
          recast: userConfig.recastEnabled ?? false,
          follow: userConfig.followEnabled ?? false,
        });
        setCriteria({
          audience: userConfig.audience || 0,
          minFollowerCount: userConfig.minFollowerCount || 25,
          minNeynarScore: userConfig.minNeynarScore || 0.5,
          minSpamLabel: userConfig.minSpamLabel !== undefined ? userConfig.minSpamLabel : 0,
        });
        
        const userTokenAddress = (userConfig.tokenAddress || BASE_USDC_ADDRESS).toLowerCase();
        console.log('🔍 Loading user token from config:', userTokenAddress);
        setSelectedToken(userTokenAddress);
        setCustomTokenAddress(userTokenAddress);
        lookupTokenName(userTokenAddress, { updateSelected: true });
      const lastAllowanceValueRaw = userConfig.lastAllowance ?? '0';
      const normalizedAllowance = normalizeAllowance(lastAllowanceValueRaw);
      setAllowanceCache(prev => ({ ...prev, [userTokenAddress]: normalizedAllowance }));
      setDisplayAllowance(normalizedAllowance);
        
        const historySet = new Set<string>();
        historySet.add(userTokenAddress);
        if (Array.isArray(userConfig.tokenHistory)) {
          userConfig.tokenHistory
            .map((address: string) => address?.toLowerCase())
            .filter(Boolean)
            .forEach(address => historySet.add(address as string));
        }
        const historyArray = Array.from(historySet);
        setTokenHistory(historyArray);
        
        historyArray
          .filter(address => address !== userTokenAddress)
          .forEach(address => lookupTokenName(address, { updateSelected: false }));
      } else {
        // Only set USDC as default if no user config exists yet
        setSelectedToken(BASE_USDC_ADDRESS);
        setCustomTokenAddress(BASE_USDC_ADDRESS);
        setSelectedTokenLabel('USDC');
        setIsValidToken(true);
        setTokenLabels(prev => ({ ...prev, [BASE_USDC_ADDRESS]: 'USDC' }));
        setTokenHistory([BASE_USDC_ADDRESS]);
        setAllowanceCache(prev => ({ ...prev, [BASE_USDC_ADDRESS]: '0' }));
        setDisplayAllowance('0');
        console.log('🔍 No user config, setting default USDC token');
      }
    }, [userConfig]);

  useEffect(() => {
    if (selectedToken && tokenAllowance !== null) {
      setDisplayAllowance(tokenAllowance);
      setAllowanceCache(prev => ({ ...prev, [selectedToken]: tokenAllowance }));
    }
  }, [tokenAllowance, selectedToken]);

  const lookupTokenName = async (
    tokenAddress: string,
    options: { updateSelected?: boolean } = { updateSelected: true }
  ): Promise<{ label: string; isValid: boolean }> => {
    const { updateSelected = true } = options;
    const normalized = tokenAddress.toLowerCase();
    try {
      let resolvedName = 'Invalid Token';
      
      // Check if it's USDC on Base
      if (normalized === BASE_USDC_ADDRESS) {
        resolvedName = 'USDC';
      } else {
        // Use a free token lookup service (CoinGecko)
        try {
          const response = await fetch(`https://api.coingecko.com/api/v3/coins/base/contract/${tokenAddress}`);
          if (response.ok) {
            const data = await response.json();
            resolvedName = data.symbol?.toUpperCase() || 'Unknown Token';
          }
        } catch (cgError) {
          console.log('CoinGecko lookup failed, trying fallback...');
        }
        
        if (resolvedName === 'Unknown Token' || resolvedName === 'Invalid Token') {
          // Fallback: Try backend token info endpoint
          try {
            const response = await fetch(`${BACKEND_URL}/api/token-info/${tokenAddress}`);
            if (response.ok) {
              const data = await response.json();
              resolvedName = data.symbol || 'Unknown Token';
            }
          } catch (backendError) {
            console.log('Backend token lookup failed');
          }
        }
      }
      
      const isKnownSymbol = resolvedName !== 'Invalid Token' && resolvedName !== 'Unknown Token';
      const label = isKnownSymbol ? resolvedName : `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
      
      setTokenLabels(prev => ({ ...prev, [normalized]: label }));
      
      if (updateSelected) {
        setSelectedTokenLabel(label);
        setIsValidToken(isKnownSymbol);
      }
      
      return { label, isValid: isKnownSymbol };
    } catch (error) {
      console.error('Token lookup failed:', error);
      const fallbackLabel = `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
      if (updateSelected) {
        setSelectedTokenLabel(fallbackLabel);
        setIsValidToken(false);
      }
      setTokenLabels(prev => ({ ...prev, [normalized]: fallbackLabel }));
      return { label: fallbackLabel, isValid: false };
    }
  };

  const handleTokenAddressChange = async (newAddress: string) => {
    setCustomTokenAddress(newAddress);
    if (!newAddress) {
      setIsValidToken(false);
      setDisplayAllowance('0');
      return;
    }
    
    if (newAddress.length === 42 && newAddress.startsWith('0x')) {
      const normalized = newAddress.toLowerCase();
      setSelectedToken(normalized);
      setDisplayAllowance('0');
      const { isValid } = await lookupTokenName(normalized, { updateSelected: true });
      if (isValid) {
        setTokenHistory(prev => {
          const next = [normalized, ...prev.filter(addr => addr !== normalized)];
          return next;
        });
        // Fetch allowance for display (no webhook updates)
        if (address) {
          console.log('🔍 Fetching allowance for new token selection');
          fetchTokenAllowance(normalized, { force: true });
        }
      } else {
        setIsValidToken(false);
        setDisplayAllowance('0');
      }
    } else {
      setIsValidToken(false);
      setDisplayAllowance('0');
    }
  };
    
    const handleTokenSelect = async (tokenAddress: string) => {
      await handleTokenAddressChange(tokenAddress);
      setShowTokenDropdown(false);
    };

  // Fetch allowance when user config loads (for display only - no webhook updates)
  useEffect(() => {
    if (userConfig?.tokenAddress && address) {
      console.log('🔍 Fetching allowance for display on settings page');
      fetchTokenAllowance(userConfig.tokenAddress, { force: true });
    }
  }, [userConfig?.tokenAddress, address, fetchTokenAllowance]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowTokenDropdown(false);
    if (showTokenDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showTokenDropdown]);

  const handleSaveTippingConfig = async () => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    // Check for validation errors
    const hasErrors = Object.keys(amountErrors).some(key => amountErrors[key]);
    if (hasErrors) {
      toast.error('Please fix tip amount errors before saving', { duration: 2000 });
      return;
    }

    try {
      setPendingConfigSave(true);
        const normalizedSelectedToken = selectedToken.toLowerCase();
        const historyToPersist = Array.from(new Set([normalizedSelectedToken, ...tokenHistory]));
        setTokenHistory(historyToPersist);
        
        const sanitizedAmounts = {
          like: tippingToggles.like ? (parseFloat(tippingAmounts.like) >= 0.005 ? tippingAmounts.like : DEFAULT_TIP_AMOUNTS.like) : '0',
          reply: tippingToggles.reply ? tippingAmounts.reply : '0',
          recast: tippingToggles.recast ? tippingAmounts.recast : '0',
          follow: tippingToggles.follow ? tippingAmounts.follow : '0',
        };
        
      await setTippingConfig({
          tokenAddress: normalizedSelectedToken,
          likeAmount: sanitizedAmounts.like,
          replyAmount: sanitizedAmounts.reply,
          recastAmount: sanitizedAmounts.recast,
          followAmount: sanitizedAmounts.follow,
        spendingLimit: '999999', // No limit - controlled by token approvals
        audience: criteria.audience,
        minFollowerCount: criteria.minFollowerCount,
        minNeynarScore: criteria.minNeynarScore,
        minSpamLabel: criteria.minSpamLabel,
        likeEnabled: tippingToggles.like,
        replyEnabled: tippingToggles.reply,
        recastEnabled: tippingToggles.recast,
        followEnabled: tippingToggles.follow,
        isActive: true,
          totalSpent: userConfig?.totalSpent || '0',
          tokenHistory: historyToPersist,
      });
      toast.success('Tipping configuration saved! Moving to criteria...', { duration: 2000 });
    } catch (error: any) {
      toast.error('Failed to save configuration: ' + error.message, { duration: 2000 });
    }
  };

  const handleApproveAllowance = async () => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    if (!allowanceAmount || allowanceAmount === '0') {
      toast.error('Please enter an allowance amount', { duration: 2000 });
      return;
    }

    try {
      setIsApprovingLocal(true);
      await approveToken(selectedToken, allowanceAmount);
      toast.success('Approval successful! Moving to config...', { duration: 2000 });
    } catch (error: any) {
      toast.error('Failed to approve allowance: ' + error.message, { duration: 2000 });
    } finally {
      setIsApprovingLocal(false);
    }
  };

  const handleRevokeAllowance = async () => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    try {
      setIsRevokingLocal(true);
      await revokeTokenAllowance(selectedToken);
    } catch (error: any) {
      toast.error('Failed to revoke allowance: ' + error.message, { duration: 2000 });
    } finally {
      setIsRevokingLocal(false);
    }
  };

  const handleRevokeConfig = async () => {
    if (!address) {
      toast.error('Please connect your wallet first', { duration: 2000 });
      return;
    }

    if (confirm('Are you sure you want to deactivate your tipping configuration?')) {
      try {
        await revokeConfig();
        toast.success('Tipping configuration deactivated', { duration: 2000 });
      } catch (error: any) {
        toast.error('Failed to deactivate configuration: ' + error.message, { duration: 2000 });
      }
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-yellow-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 bg-yellow-50 min-h-full">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Connect Your Wallet</h1>
          <p className="text-gray-600 mb-8">Please connect your Farcaster wallet to configure tipping settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 bg-yellow-50 min-h-full">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <p className="text-xl text-gray-700">
          Configure your tipping preferences
        </p>
      </motion.div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-8 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('allowance')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'allowance'
              ? 'bg-white text-accent shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Approve Allowance
        </button>
        <button
          onClick={() => setActiveTab('amounts')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'amounts'
              ? 'bg-white text-accent shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Set Tipping Amount
        </button>
        <button
          onClick={() => setActiveTab('criteria')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'criteria'
              ? 'bg-white text-accent shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Set Criteria
        </button>
      </div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Set Tipping Amount Tab */}
        {activeTab === 'amounts' && (
          <div className="bg-white rounded-2xl p-8 card-shadow">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Set Tipping Amounts</h2>
            
            <div className="space-y-6">
                {[
                  { key: 'like', label: 'Like', icon: Heart, default: DEFAULT_TIP_AMOUNTS.like },
                  { key: 'reply', label: 'Reply', icon: MessageCircle, default: DEFAULT_TIP_AMOUNTS.reply },
                  { key: 'recast', label: 'Recast', icon: Repeat, default: DEFAULT_TIP_AMOUNTS.recast },
                  { key: 'follow', label: 'Follow', icon: UserPlus, default: DEFAULT_TIP_AMOUNTS.follow },
                ].map(({ key, label, icon: Icon, default: defaultAmount }) => {
                  const toggleKey = key as keyof typeof tippingToggles;
                  const amountKey = key as keyof typeof tippingAmounts;
                  const isEnabled = tippingToggles[toggleKey];
                  return (
                    <div key={key} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Icon className="w-5 h-5 text-gray-600" />
                          <span className="font-medium">{label}</span>
                        </div>
                        <button
                          onClick={() =>
                            setTippingToggles(prev => {
                              const isEnabling = !prev[toggleKey];
                              setTippingAmounts(prevAmounts => {
                                if (isEnabling) {
                                  const currentValue = prevAmounts[amountKey];
                                  const nextValue =
                                    !currentValue || currentValue === '0'
                                      ? defaultAmount
                                      : currentValue;
                                  return { ...prevAmounts, [amountKey]: nextValue };
                                }
                                return { ...prevAmounts, [amountKey]: '0' };
                              });
                              setAmountErrors(prevErrors => {
                                const newErrors = { ...prevErrors };
                                delete newErrors[key];
                                return newErrors;
                              });
                              return { ...prev, [toggleKey]: isEnabling };
                            })
                          }
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            isEnabled ? 'bg-yellow-400' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${
                              isEnabled ? 'left-5' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </div>
                      <div className="flex items-center space-x-2 mt-2">
                        <input
                          type="number"
                          step="0.001"
                          min="0.005"
                          value={tippingAmounts[amountKey]}
                          onChange={(e) => {
                            const value = e.target.value;
                            setTippingAmounts(prev => ({ ...prev, [amountKey]: value }));
                            if (tippingToggles[toggleKey]) {
                              validateAmount(value, key);
                            }
                          }}
                          disabled={!isEnabled}
                          className={`w-20 px-2 py-1 border rounded text-sm ${
                            amountErrors[key] ? 'border-red-500' : 'border-gray-300'
                          } ${!isEnabled ? 'bg-gray-100 cursor-not-allowed opacity-70' : ''}`}
                          placeholder={defaultAmount}
                        />
                        <span className="text-sm text-gray-600">{selectedTokenLabel}</span>
                      </div>
                      {amountErrors[key] && (
                        <div className="text-red-500 text-xs mt-1">
                          {amountErrors[key]}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>


            <button
              onClick={handleSaveTippingConfig}
              disabled={isSettingConfig}
              className="w-full mt-6 bg-accent text-white py-3 px-4 rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isSettingConfig ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        )}

        {/* Set Criteria Tab */}
        {activeTab === 'criteria' && (
          <div className="bg-white rounded-2xl p-8 card-shadow">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Set Tipping Criteria</h2>
            
            <div className="space-y-6">
              {/* Audience Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Who can receive tips?</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 0, label: 'Following', desc: 'Only users you follow' },
                    { value: 1, label: 'Followers', desc: 'Only your followers' },
                    { value: 2, label: 'Anyone', desc: 'Any Farcaster user' },
                  ].map(({ value, label, desc }) => (
                    <button
                      key={value}
                      onClick={() => setCriteria(prev => ({ ...prev, audience: value }))}
                      className={`p-3 border-2 rounded-lg text-center transition-colors ${
                        criteria.audience === value
                          ? 'border-accent bg-accent/5 text-accent'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-sm leading-tight">{label}</div>
                      <div className="text-xs text-gray-600 mt-1 leading-tight">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Minimum Follower Count */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Follower Count: {criteria.minFollowerCount}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="25"
                  value={criteria.minFollowerCount}
                  onChange={(e) => setCriteria(prev => ({ ...prev, minFollowerCount: parseInt(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0</span>
                  <span>1000</span>
                </div>
              </div>

              {/* Minimum Neynar Score */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Neynar Score: {criteria.minNeynarScore.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={criteria.minNeynarScore}
                  onChange={(e) => setCriteria(prev => ({ ...prev, minNeynarScore: parseFloat(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0.0</span>
                  <span>1.0</span>
                </div>
              </div>

              {/* Minimum Spam Label */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Spam Label: {criteria.minSpamLabel}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="1"
                  value={criteria.minSpamLabel}
                  onChange={(e) => setCriteria(prev => ({ ...prev, minSpamLabel: parseInt(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0 (No filter)</span>
                  <span>1 (Level 1+)</span>
                  <span>2 (Level 2 only)</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveTippingConfig}
              disabled={isSettingConfig}
              className="w-full mt-6 bg-accent text-white py-3 px-4 rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isSettingConfig ? 'Saving...' : 'Save Criteria'}
            </button>
          </div>
        )}

        {/* Approve Allowance Tab */}
        {activeTab === 'allowance' && (
          <div className="bg-white rounded-2xl p-8 card-shadow">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Approve Token Allowance</h2>
            
            <div className="space-y-6">
              {/* Token Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Token</label>
                <div className="relative">
                  <input
                    type="text"
                    value={customTokenAddress}
                    onChange={(e) => handleTokenAddressChange(e.target.value)}
                    placeholder="Token address"
                    className={`w-full px-3 py-2 pr-20 border rounded text-sm ${
                      isValidToken ? 'border-gray-300' : 'border-red-300 bg-red-50'
                    }`}
                  />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowTokenDropdown(!showTokenDropdown);
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 flex items-center space-x-1 max-w-[60%]"
                    >
                      <span className="truncate">{selectedTokenLabel}</span>
                      <ChevronDown className="w-3 h-3 flex-shrink-0" />
                    </button>
                  
                  {showTokenDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
                        {Array.from(new Set([BASE_USDC_ADDRESS, ...tokenHistory])).map(address => {
                          const normalized = address.toLowerCase();
                          const label =
                            tokenLabels[normalized] && tokenLabels[normalized] !== 'Unknown Token'
                              ? tokenLabels[normalized]
                              : normalized === BASE_USDC_ADDRESS
                                ? 'USDC'
                                : `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
                          return (
                            <button
                              key={normalized}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleTokenSelect(normalized)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex justify-between items-center"
                            >
                              <span>{label}</span>
                              <span className="text-xs text-gray-500">
                                {normalized.slice(0, 6)}...{normalized.slice(-4)}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
                  {customTokenAddress && isValidToken && (
                    <p className="text-sm mt-2 text-gray-600">
                      {selectedTokenLabel} on Base
                    </p>
                  )}
              </div>


              {/* Allowance Amount */}
              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Allowance Amount ({selectedTokenLabel})</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={allowanceAmount}
                  onChange={(e) => setAllowanceAmount(e.target.value)}
                  placeholder="Enter amount to approve"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>

              {/* Current Allowance */}
                {hasAllowanceValue && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Current Allowance</p>
                    <p className="text-lg font-semibold">
                      {formatAmount(displayAllowance)} {selectedTokenLabel}
                    </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                  <button
                  onClick={handleApproveAllowance}
                  disabled={isApprovingLocal || isApproving || !allowanceAmount || !isValidToken}
                  className="flex-1 border-2 border-green-600 text-green-600 py-3 px-4 rounded-lg font-medium hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isApprovingLocal || isApproving ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-green-600 border-t-transparent"></div>
                  ) : (
                    'Approve'
                  )}
                </button>
                  <button
                  onClick={handleRevokeAllowance}
                    disabled={isRevokingLocal || isRevokingAllowance || !hasAllowanceValue || allowanceValue === 0}
                  className="flex-1 border-2 border-red-600 text-red-600 py-3 px-4 rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isRevokingLocal || isRevokingAllowance ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-red-600 border-t-transparent"></div>
                  ) : (
                    'Revoke'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>

    </div>
  );
}
