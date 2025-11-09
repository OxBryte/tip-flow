import { useState, useEffect } from 'react';

interface FarcasterUser {
  fid: number;
  username?: string;
  displayName?: string;
  pfpUrl?: string;
}

interface FarcasterContext {
  user?: FarcasterUser;
}

export function useFarcasterSDK() {
  const [currentUser, setCurrentUser] = useState<FarcasterUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMiniapp, setIsMiniapp] = useState(false);

  useEffect(() => {
    const initializeFarcaster = async () => {
      try {
        // Check if we're in a Farcaster miniapp
        const isInFarcaster = window.location.href.includes('farcaster.xyz') || 
                             window.location.href.includes('warpcast.com') ||
                             window.navigator.userAgent.includes('Farcaster');
        
        if (!isInFarcaster) {
          console.log('Not in Farcaster miniapp, skipping SDK initialization');
          setIsLoading(false);
          return;
        }

        setIsMiniapp(true);
        
        // Import Farcaster SDK
        const { sdk } = await import('@farcaster/miniapp-sdk');
        
        // Get user context
        const context = await sdk.context;
        
        if (context?.user) {
          const userData = {
            fid: context.user.fid,
            username: context.user.username || '',
            displayName: context.user.displayName || '',
            pfpUrl: context.user.pfpUrl || ''
          };
          
          setCurrentUser(userData);
          
          // Save user profile to our database
          try {
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/user-profile`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fid: userData.fid,
                username: userData.username,
                displayName: userData.displayName,
                pfpUrl: userData.pfpUrl,
                followerCount: 0 // We don't have this from SDK
              })
            });
            console.log('✅ User profile saved to database');
          } catch (error) {
            console.error('❌ Failed to save user profile:', error);
          }
          
          // SDK initialization complete
        }
        
      } catch (error) {
        console.error('Error initializing Farcaster SDK:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeFarcaster();
  }, []);

  return {
    currentUser,
    isLoading,
    isMiniapp
  };
}