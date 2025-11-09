import { useHomepageData, useLeaderboardData } from '@/hooks/usePIT';
import { useFarcasterWallet } from '@/hooks/useFarcasterWallet';
import { formatAmount } from '@/utils/contracts';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Info, X } from 'lucide-react';
import { useRouter } from 'next/router';

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
  totalEngagementValue?: number | null;
  likeAmount?: number;
  recastAmount?: number;
  replyAmount?: number;
  likeEnabled?: boolean;
  recastEnabled?: boolean;
  replyEnabled?: boolean;
  criteria?: {
    audience: number;
    minFollowerCount: number;
    minNeynarScore: number;
  };
}

interface Cast {
  hash: string;
  text: string;
  timestamp: string;
  embeds?: CastEmbed[];
  reactions?: CastReactions;
  replies?: CastReplies;
  tipper?: CastTipper;
  farcasterUrl?: string;
}

export default function Home() {
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d'>('24h');
  const { casts, users: tipsReceivedUsers, amounts: tipsReceivedAmounts, isLoading, isLoadingMore, hasMore, loadMore } = useHomepageData(timeFilter);
  const { users: tipsGivenUsers, amounts: tipsGivenAmounts } = useLeaderboardData(timeFilter);
  const { connectWallet, isLoading: walletLoading, isConnected, currentUser } = useFarcasterWallet();
  const [mounted, setMounted] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleGetStarted = async () => {
    try {
      await connectWallet();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-yellow-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Ecion – Tip Your Audience</title>
        <meta name="description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta property="og:title" content="Ecion – Tip Your Audience" />
        <meta property="og:description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta property="og:image" content="https://ecion.vercel.app/og-image.png" />
        <meta property="og:url" content="https://ecion.vercel.app" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Ecion – Tip Your Audience" />
        <meta name="twitter:description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta name="twitter:image" content="https://ecion.vercel.app/og-image.png" />
      </Head>
      <div className="max-w-4xl mx-auto px-4 py-8 bg-yellow-50 min-h-screen">
        {/* Hero Section */}
        <div className="text-center py-6 relative">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="absolute -top-2 right-0 w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
            title="How Ecion works"
          >
            <Info size={16} className="text-gray-600" />
          </button>
          
          {showInstructions && (
            <div className="absolute top-12 right-0 w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-50 text-left">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-gray-900">How Ecion Works</h3>
                <button
                  onClick={() => setShowInstructions(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="text-xs text-gray-700 space-y-2 max-h-96 overflow-y-auto">
                <p>
                  <strong>Ecion</strong> lets you tip your engagers and boost your casts by setting up your boost config. Control who receives tips with customizable criteria like minimum follower count, limiting to followers or mutuals, or using Neynar Score filters to avoid inactive users.
                </p>
                <p>
                  Only your <strong>latest cast</strong> can receive tips to ensure quality engagement. Tip amounts can scale with Neynar Scores, making Ecion a smart tool for Farcaster users to gain attention and appreciate their daily audience.
                </p>
                <p className="font-semibold">You can:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Set follower-based limits (e.g., only users with certain following can receive tips)</li>
                  <li>Restrict tips to followers or mutuals</li>
                  <li>Use Neynar Score filtering to exclude inactive or low-quality users</li>
                  <li>Ensure only the latest cast is eligible for tips to avoid spam</li>
                </ul>
                <p>
                  Ecion is a smarter way to grow visibility, reward real participation, and keep the Farcaster experience clean and meaningful.
                </p>
              </div>
            </div>
          )}
          
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Tip Your Audience
          </h2>
          <p className="text-lg text-gray-600 mb-4 max-w-2xl mx-auto">
            With Ecion you can boost your casts by tipping engagers for their interactions easily.
          </p>
          {!isConnected && (
            <button 
              onClick={handleGetStarted}
              disabled={walletLoading}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {walletLoading ? 'Connecting...' : 'Get Started'}
            </button>
          )}
        </div>

        {/* Recent Casts from Tippers */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Casts from Tippers</h3>
          <div className="space-y-3">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      {/* User Info Skeleton */}
                      <div className="flex items-center space-x-3 mb-3">
                        <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
                        <div className="flex-1">
                          <div className="w-32 h-4 bg-gray-300 rounded mb-1"></div>
                          <div className="w-24 h-3 bg-gray-300 rounded"></div>
                        </div>
                        <div className="w-20 h-6 bg-gray-300 rounded-full"></div>
                      </div>
                      
                      {/* Cast Content Skeleton */}
                      <div className="mb-3">
                        <div className="w-full h-4 bg-gray-300 rounded mb-2"></div>
                        <div className="w-3/4 h-4 bg-gray-300 rounded mb-2"></div>
                        <div className="w-1/2 h-4 bg-gray-300 rounded"></div>
                      </div>
                      
                      {/* Cast Stats Skeleton */}
                      <div className="flex items-center space-x-6 mb-3">
                        <div className="w-8 h-3 bg-gray-300 rounded"></div>
                        <div className="w-8 h-3 bg-gray-300 rounded"></div>
                        <div className="w-8 h-3 bg-gray-300 rounded"></div>
                      </div>
                      
                      {/* Criteria Skeleton */}
                      <div className="bg-gray-100 border border-gray-200 rounded-lg p-3">
                        <div className="w-full h-3 bg-gray-300 rounded mb-1"></div>
                        <div className="w-2/3 h-3 bg-gray-300 rounded"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : !casts || casts.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500">
                <p className="text-lg">No recent casts from tippers yet!</p>
                <p className="text-sm mt-1">Users need to approve USDC and configure tipping to appear here</p>
              </div>
            ) : (
              casts.map((cast: Cast, index: number) => (
                <div
                  key={cast.hash}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    if (cast.farcasterUrl) {
                      window.open(cast.farcasterUrl, '_blank');
                    }
                  }}
                >
                  {/* User Info */}
                  <div className="flex items-center space-x-2 mb-2">
                    {cast.tipper?.pfpUrl ? (
                      <img
                        src={cast.tipper.pfpUrl}
                        alt={cast.tipper.displayName || cast.tipper.username}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-gray-600">
                          {(cast.tipper?.displayName || cast.tipper?.username || 'U')[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-gray-900">
                        {cast.tipper?.displayName || cast.tipper?.username || 'Anonymous Tipper'}
                      </p>
                      <p className="text-xs text-gray-500">
                        @{cast.tipper?.username || 'unknown'} • {new Date(cast.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Active
                    </span>
                  </div>

                  {/* Cast Content */}
                  <div className="mb-2">
                    <p className="text-sm text-gray-900 leading-relaxed">
                      {cast.text}
                    </p>
                    
                    {/* Cast Images */}
                    {cast.embeds && cast.embeds.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {cast.embeds.slice(0, 4).map((embed: CastEmbed, embedIndex: number) => (
                          embed.url && embed.url.match(/\.(jpeg|jpg|gif|png)$/i) && (
                            <img
                              key={embedIndex}
                              src={embed.url}
                              alt="Cast embed"
                              className="rounded-lg max-h-48 w-full object-cover"
                            />
                          )
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Engagement Stats - Show tip amounts inline */}
                  <div className="flex items-center space-x-4 text-xs mb-2">
                    {/* Like */}
                    <span className="flex items-center space-x-1">
                      <span>❤️</span>
                        {cast.tipper?.likeEnabled && typeof cast.tipper.likeAmount === 'number' && cast.tipper.likeAmount > 0 ? (
                        <span className="font-semibold text-green-600">
                          ${cast.tipper.likeAmount >= 0.01 
                            ? cast.tipper.likeAmount.toString() 
                            : cast.tipper.likeAmount.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-gray-500">{cast.reactions?.likes_count || 0}</span>
                      )}
                    </span>
                    
                    {/* Recast */}
                    <span className="flex items-center space-x-1">
                      <span>🔄</span>
                        {cast.tipper?.recastEnabled && typeof cast.tipper.recastAmount === 'number' && cast.tipper.recastAmount > 0 ? (
                        <span className="font-semibold text-green-600">
                          ${cast.tipper.recastAmount >= 0.01 
                            ? cast.tipper.recastAmount.toString() 
                            : cast.tipper.recastAmount.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-gray-500">{cast.reactions?.recasts_count || 0}</span>
                      )}
                    </span>
                    
                    {/* Reply */}
                    <span className="flex items-center space-x-1">
                      <span>💬</span>
                        {cast.tipper?.replyEnabled && typeof cast.tipper.replyAmount === 'number' && cast.tipper.replyAmount > 0 ? (
                        <span className="font-semibold text-green-600">
                          ${cast.tipper.replyAmount >= 0.01 
                            ? cast.tipper.replyAmount.toString() 
                            : cast.tipper.replyAmount.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-gray-500">{cast.replies?.count || 0}</span>
                      )}
                    </span>
                  </div>

                  {/* Tipper Criteria */}
                  {cast.tipper?.criteria && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs">
                      <div className="space-y-0.5 text-gray-700">
                        {cast.tipper.criteria.audience === 0 && (
                          <div>• Must be followed by @{cast.tipper.username}</div>
                        )}
                        {cast.tipper.criteria.audience === 1 && (
                          <div>• Must be a follower of @{cast.tipper.username}</div>
                        )}
                        {cast.tipper.criteria.audience === 2 && (
                          <div>• Anyone can earn tips</div>
                        )}
                        {cast.tipper.criteria.minFollowerCount > 0 && (
                          <div>• Must have {cast.tipper.criteria.minFollowerCount}+ followers</div>
                        )}
                        {cast.tipper.criteria.minNeynarScore > 0 && (
                          <div>• Must have {cast.tipper.criteria.minNeynarScore}+ Neynar score</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            
            {/* Load More Button - Only show if there are 10+ casts */}
            {hasMore && casts && casts.length >= 10 && (
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
                    'Load More Casts'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

    </div>
    </>
  );
}