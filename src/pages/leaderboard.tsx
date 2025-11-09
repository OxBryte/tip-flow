import { motion } from 'framer-motion';
import { useLeaderboardData } from '@/hooks/usePIT';
import { formatAmount } from '@/utils/contracts';
import { Trophy, Medal, Award, Crown, Star, Share2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useFarcasterWallet } from '@/hooks/useFarcasterWallet';
import { useFarcasterSDK } from '@/hooks/useFarcasterSDK';
import { useFarcasterEmbed } from '@/hooks/useFarcasterEmbed';

export default function Leaderboard() {
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d'>('24h');
  const { tippers, earners, userStats, isLoading, isLoadingMore, hasMore, loadMore } = useLeaderboardData(timeFilter);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'tipped' | 'earned'>('tipped');
  const { currentUser: walletUser } = useFarcasterWallet();
  const { currentUser: sdkUser, isLoading: sdkLoading } = useFarcasterSDK();
  const { handleShare } = useFarcasterEmbed();
  
  // Use SDK user if available, otherwise fall back to wallet user
  const currentUser = sdkUser || walletUser;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || sdkLoading) {
    return (
      <div className="min-h-screen bg-yellow-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { x: -50, opacity: 0 },
    visible: {
      x: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 24,
      },
    },
  };

  const getRankIcon = (index: number) => {
    return <span className="text-lg font-semibold text-gray-600">#{index + 1}</span>;
  };

  const getRankStyle = (index: number) => {
    return 'bg-white hover:bg-gray-50 border border-gray-200';
  };

  return (
    <div className="space-y-4">

      {/* Tabs */}
      <div className="flex justify-center mb-6 mt-8">
        <div className="flex bg-white rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('tipped')}
            className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'tipped'
                ? 'bg-accent text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Tipped
          </button>
          <button
            onClick={() => setActiveTab('earned')}
            className={`px-6 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'earned'
                ? 'bg-accent text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Earned
          </button>
        </div>
      </div>

      {/* Full leaderboard */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="bg-white rounded-2xl p-5 card-shadow"
      >
        {/* Title and Time Filter on Same Line */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-accent">
            {activeTab === 'tipped' ? 'Tippers' : 'Earners'}
          </h2>
          
          <div className="flex items-center space-x-3">
            {/* Time Filter - Smaller */}
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              {(['24h', '7d', '30d'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTimeFilter(period)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    timeFilter === period
                      ? 'bg-accent text-white'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
        </div>

        
        {/* You Section - Show if user is logged in (will show stats when loaded) */}
        {currentUser && (
          <div className="mb-6 p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-xl border border-yellow-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex items-center justify-center w-6">
                  <span className="text-sm font-bold text-yellow-600">You</span>
                </div>
                <div className="flex items-center space-x-2">
                  {currentUser.pfpUrl ? (
                    <img
                      src={currentUser.pfpUrl}
                      alt={currentUser.displayName || currentUser.username}
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-600">
                        {(currentUser.displayName || currentUser.username)?.[0]?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-sm text-gray-900">
                      {currentUser.displayName || currentUser.username}
                    </p>
                    <p className="text-xs text-gray-500">
                      @{currentUser.username}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">
                    {userStats ? (
                      activeTab === 'tipped' 
                        ? (timeFilter === '24h' ? userStats.tippings24h :
                           timeFilter === '7d' ? userStats.tippings7d : userStats.tippings30d).toFixed(2)
                        : (timeFilter === '24h' ? userStats.earnings24h :
                           timeFilter === '7d' ? userStats.earnings7d : userStats.earnings30d).toFixed(2)
                    ) : (
                      '0.00'
                    )} USDC
                  </p>
                  <p className="text-xs text-gray-500">
                    {activeTab === 'tipped' ? 'tipped' : 'earned'}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!currentUser?.fid) return;
                    
                    const shareUrl = `https://ecion.vercel.app/share/${currentUser.fid}?time=${timeFilter}&type=${activeTab === 'tipped' ? 'tippings' : 'earnings'}`;
                    
                    // Get the amount for the share text
                    const amount = activeTab === 'tipped' 
                      ? (timeFilter === '24h' ? userStats?.tippings24h :
                         timeFilter === '7d' ? userStats?.tippings7d : userStats?.tippings30d)
                      : (timeFilter === '24h' ? userStats?.earnings24h :
                         timeFilter === '7d' ? userStats?.earnings7d : userStats?.earnings30d);
                    
                    const shareText = `I ${activeTab === 'tipped' ? 'tipped' : 'earned'} ${amount?.toFixed(2) || '0'} USDC in ${timeFilter} on Ecion`;
                    
                    // Use composeCast to share with embed preview
                    await handleShare(shareText, shareUrl);
                  }}
                  className="p-2 text-gray-600 hover:text-yellow-600 hover:bg-yellow-200 rounded-lg transition-colors"
                  title="Share your stats"
                >
                  <Share2 size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
        
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center justify-center w-6">
                      <div className="w-4 h-3 bg-gray-300 rounded"></div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
                      <div>
                        <div className="w-20 h-3 bg-gray-300 rounded mb-1"></div>
                        <div className="w-14 h-2 bg-gray-300 rounded"></div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="w-14 h-4 bg-gray-300 rounded mb-1"></div>
                    <div className="w-10 h-2 bg-gray-300 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (activeTab === 'earned' ? earners : tippers).length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No tips received yet!</p>
            <p className="mt-2">Start engaging to earn tips</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(activeTab === 'earned' ? earners : tippers).map((user, index) => (
              <motion.div
                key={user.fid}
                variants={itemVariants}
                whileHover={{ x: 10 }}
                className={`flex items-center justify-between p-3 rounded-lg transition-all duration-200 ${getRankStyle(
                  index
                )}`}
              >
                <div className="flex items-center space-x-3">
                  <div className="flex items-center justify-center w-6">
                    <span className="text-sm font-semibold text-gray-600">#{index + 1}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {user.pfpUrl ? (
                      <img
                        src={user.pfpUrl}
                        alt={user.displayName || user.username}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        <span className="text-xs font-medium text-gray-600">
                          {(user.displayName || user.username)?.[0]?.toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-sm text-gray-900">
                        {user.displayName || user.username || 'Unknown User'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user.username ? `@${user.username}` : `FID ${user.fid}`}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">
                    {user.totalAmount.toFixed(2)} USDC
                  </p>
                  <p className="text-xs text-gray-500">
                    {activeTab === 'tipped' ? 'tipped' : 'earned'}
                  </p>
                </div>
              </motion.div>
            ))}
            
            {/* Load More Button - Only show if there are 10+ users */}
            {hasMore && (activeTab === 'tipped' ? tippers : earners).length >= 10 && (
              <div className="flex justify-center mt-4">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                >
                  {isLoadingMore ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-gray-400 border-t-gray-600"></div>
                      <span>Loading...</span>
                    </div>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}