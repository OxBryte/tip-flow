import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

interface UserStats {
  fid: number;
  totalEarnings: number;
  earnings24h: number;
  earnings7d: number;
  earnings30d: number;
  totalTippings: number;
  tippings24h: number;
  tippings7d: number;
  tippings30d: number;
}

interface UserProfile {
  username: string;
  displayName: string;
  pfpUrl: string;
  followerCount: number;
}

interface SharePageProps {
  fid: number;
  time: string;
  type: 'earnings' | 'tippings';
  userStats: UserStats;
  userProfile: UserProfile;
}

export default function SharePage({ fid, time, type, userStats, userProfile }: SharePageProps) {
  const router = useRouter();
  const [amount, setAmount] = useState(0);
  const [timeLabel, setTimeLabel] = useState('');

  useEffect(() => {
    // Calculate amount and time label based on parameters
    let calculatedAmount = 0;
    let calculatedTimeLabel = '';

    switch (time) {
      case '24h':
        calculatedAmount = type === 'earnings' ? userStats.earnings24h : userStats.tippings24h;
        calculatedTimeLabel = '24h';
        break;
      case '7d':
        calculatedAmount = type === 'earnings' ? userStats.earnings7d : userStats.tippings7d;
        calculatedTimeLabel = '7d';
        break;
      case '30d':
        calculatedAmount = type === 'earnings' ? userStats.earnings30d : userStats.tippings30d;
        calculatedTimeLabel = '30d';
        break;
      case 'total':
      default:
        calculatedAmount = type === 'earnings' ? userStats.totalEarnings : userStats.totalTippings;
        calculatedTimeLabel = 'Total';
        break;
    }

    setAmount(calculatedAmount);
    setTimeLabel(calculatedTimeLabel);
  }, [time, type, userStats]);

  // Generate embed image URL - use Next.js API route for dynamic image generation
  // This route will render as a custom image when embedded (like generateMetadata pattern)
  const embedImageUrl = `https://ecion.vercel.app/api/og/${fid}?time=${time}&type=${type}`;

  // Generate Farcaster Mini App embed JSON  
  const miniappEmbed = {
    version: "1",
    imageUrl: embedImageUrl,
    button: {
      title: "View on Ecion",
      action: {
        type: "launch_frame",
        url: `https://ecion.vercel.app/leaderboard?userFid=${fid}&time=${time}`,
        name: "Ecion",
        splashImageUrl: "https://ecion.vercel.app/icon.png",
        splashBackgroundColor: "#fef3c7"
      }
    }
  };

  return (
    <>
      <Head>
        <title>Ecion - {userProfile.username} {type === 'earnings' ? 'Earnings' : 'Tippings'} {timeLabel}</title>
        
        {/* Override default OG tags with dynamic content - ensure these come after _document defaults */}
        <meta property="og:title" content={`${userProfile.username} ${type === 'earnings' ? 'Earned' : 'Tipped'} ${amount.toFixed(2)} USDC in ${timeLabel}`} />
        <meta property="og:description" content={`${userProfile.username} ${type === 'earnings' ? 'earned' : 'tipped'} ${amount.toFixed(2)} USDC in ${timeLabel} on Ecion`} />
        <meta property="og:image" content={embedImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content={`https://ecion.vercel.app/share/${fid}?time=${time}&type=${type}`} />
        <meta property="og:type" content="website" />
        
        {/* Override Twitter Card Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${userProfile.username} ${type === 'earnings' ? 'Earned' : 'Tipped'} ${amount.toFixed(2)} USDC`} />
        <meta name="twitter:description" content={`${userProfile.username} ${type === 'earnings' ? 'earned' : 'tipped'} ${amount.toFixed(2)} USDC in ${timeLabel} on Ecion`} />
        <meta name="twitter:image" content={embedImageUrl} />
        
        {/* Farcaster Mini App Embed - this should override _document defaults */}
        <meta name="fc:miniapp" content={JSON.stringify(miniappEmbed)} />
        <meta name="fc:frame" content={JSON.stringify(miniappEmbed)} />
        
        {/* Additional Meta Tags */}
        <meta name="description" content={`${userProfile.username} ${type === 'earnings' ? 'earned' : 'tipped'} ${amount.toFixed(2)} USDC in ${timeLabel} on Ecion`} />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          {/* User Profile */}
          <div className="mb-6">
            <img 
              src={userProfile.pfpUrl || '/default-avatar.png'} 
              alt={userProfile.username}
              className="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-yellow-400"
            />
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              {userProfile.displayName || userProfile.username}
            </h1>
            <p className="text-gray-600">@{userProfile.username}</p>
          </div>

          {/* Stats */}
          <div className="bg-yellow-50 rounded-xl p-6 mb-6">
            <h2 className="text-3xl font-bold text-yellow-800 mb-2">
              {amount.toFixed(2)} USDC
            </h2>
            <p className="text-yellow-700 text-lg">
              {type === 'earnings' ? 'Earned' : 'Tipped'} in {timeLabel}
            </p>
          </div>

          {/* Action Button */}
          <button
            onClick={() => router.push(`/leaderboard?userFid=${fid}&time=${time}`)}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-8 rounded-xl transition-colors duration-200 w-full"
          >
            View Full Leaderboard
          </button>

          {/* Powered by */}
          <p className="text-gray-500 text-sm mt-6">
            Powered by <span className="font-semibold text-yellow-600">Ecion</span>
          </p>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { fid } = context.params as { fid: string };
  const { time = 'total', type = 'earnings' } = context.query as { time?: string; type?: 'earnings' | 'tippings' };

  try {
    // Fetch user stats and profile from backend
    const [statsResponse, profileResponse] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user-earnings/${fid}`),
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user-profile/${fid}`)
    ]);

    if (!statsResponse.ok || !profileResponse.ok) {
      return {
        notFound: true,
      };
    }

    const userStats = await statsResponse.json();
    const userProfile = await profileResponse.json();

    return {
      props: {
        fid: parseInt(fid),
        time: time as string,
        type: type as 'earnings' | 'tippings',
        userStats,
        userProfile,
      },
    };
  } catch (error) {
    console.error('Error fetching user data:', error);
    return {
      notFound: true,
    };
  }
};