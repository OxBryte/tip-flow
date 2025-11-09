import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Head from 'next/head';
import { Home, Settings, Trophy } from 'lucide-react';
import { useFarcasterWallet } from '@/hooks/useFarcasterWallet';

const BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(0);
  const { isConnected, currentUser } = useFarcasterWallet();
  const [neynarScore, setNeynarScore] = useState<number | null>(null);

  const pages = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
    { href: '/settings', icon: Settings, label: 'Settings' },
  ];


  // Update current page when route changes
  useEffect(() => {
    const currentIndex = pages.findIndex(page => page.href === router.pathname);
    if (currentIndex !== -1) {
      setCurrentPage(currentIndex);
    }
  }, [router.pathname]);

  // Fetch Neynar score when user connects
  useEffect(() => {
    const fetchNeynarScore = async () => {
      if (currentUser?.fid) {
        try {
          const response = await fetch(`${BACKEND_URL}/api/neynar/user/score/${currentUser.fid}`);
          if (response.ok) {
            const data = await response.json();
            setNeynarScore(data.score || null);
          }
        } catch (error) {
          console.error('Failed to fetch Neynar score:', error);
        }
      }
    };
    
    fetchNeynarScore();
  }, [currentUser?.fid]);

  return (
    <>
      <Head>
        {/* Essential Open Graph Meta Tags */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Ecion – Tip Your Audience" />
        <meta property="og:description" content="With Ecion you can boost your casts by tipping engagers for their interactions easily." />
        <meta property="og:image" content="https://ecion.vercel.app/og-image.png" />
        <meta property="og:url" content="https://ecion.vercel.app" />
        <meta property="og:site_name" content="Ecion" />
        
        {/* Farcaster Mini App Embed - Proper JSON Format */}
        <meta name="fc:miniapp" content='{"version":"1","imageUrl":"https://ecion.vercel.app/og-image.png","button":{"title":"Start Tipping","action":{"type":"launch_frame","name":"Ecion","url":"https://ecion.vercel.app","splashImageUrl":"https://ecion.vercel.app/splash.png","splashBackgroundColor":"#fef3c7"}}}' />
        {/* For backward compatibility */}
        <meta name="fc:frame" content='{"version":"1","imageUrl":"https://ecion.vercel.app/og-image.png","button":{"title":"Start Tipping","action":{"type":"launch_frame","name":"Ecion","url":"https://ecion.vercel.app","splashImageUrl":"https://ecion.vercel.app/splash.png","splashBackgroundColor":"#fef3c7"}}}' />
      </Head>
      <div className="min-h-screen bg-yellow-50 flex flex-col">
      {/* Header with Logo and FID */}
      <header className="border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex justify-center items-center h-20 relative">
            <Image
              src="/ecion.png"
              alt="Ecion Logo"
              width={64}
              height={64}
              className="w-16 h-16"
            />
            {/* FID Display and Neynar Score */}
            {isConnected && currentUser?.fid && (
              <div className="absolute right-4 text-right">
                <div className="text-sm font-medium text-gray-700">
                  FID: {currentUser.fid}
                </div>
                {neynarScore !== null && (
                  <div className="text-xs text-gray-500">
                    Score: {neynarScore.toFixed(2)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content with Swipe Support */}
      <main 
        className="flex-1 overflow-y-auto"
        style={{ touchAction: 'pan-y', paddingBottom: '80px' }}
      >
        {children}
      </main>

      {/* Bottom Navigation - Fixed at bottom with 50% transparency and icons only */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-gray-100 bg-white/50 backdrop-blur-sm z-50" style={{ position: 'fixed', bottom: 0 }}>
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-around h-16">
            {pages.map((page, index) => {
              const Icon = page.icon;
              const isActive = router.pathname === page.href;
              return (
                <Link
                  key={page.href}
                  href={page.href}
                  className={`flex items-center justify-center w-full h-full transition-colors ${
                    isActive
                      ? 'text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-6 h-6" />
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
    </>
  );
}