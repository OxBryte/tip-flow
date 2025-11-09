import { useState, useEffect } from 'react';

interface FarcasterUser {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
  verifiedAddresses?: {
    ethAddresses: string[];
  };
}

export const useFarcasterMiniapp = () => {
  const [currentUser, setCurrentUser] = useState<FarcasterUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMiniapp, setIsMiniapp] = useState(false);

  useEffect(() => {
    const initializeFarcaster = async () => {
      try {
        // Check if we're in a Farcaster miniapp environment
        if (typeof window !== 'undefined') {
          // Check for Farcaster miniapp context
          const isFarcasterMiniapp = window.location.search.includes('farcaster') || 
                                   window.location.hostname.includes('farcaster') ||
                                   (window as any).farcaster;
          
          if (isFarcasterMiniapp) {
            setIsMiniapp(true);
            
            try {
              // Import Farcaster SDK dynamically
              const { sdk } = await import('@farcaster/miniapp-sdk');
              
              // Check if we're in a miniapp
              const isInMiniApp = await sdk.isInMiniApp();
              if (!isInMiniApp) {
                console.log('Not in Farcaster miniapp');
                return;
              }
              
              // Get user context
              const context = await sdk.context;
              
              // Extract real user data
              if (context?.user) {
                setCurrentUser({
                  fid: context.user.fid || 0,
                  username: context.user.username || 'unknown',
                  displayName: context.user.displayName || 'Unknown User',
                  pfpUrl: context.user.pfpUrl || '',
                  verifiedAddresses: {
                    ethAddresses: (context.user as any).verifiedAddresses?.ethAddresses || []
                  }
                });
              }
              
              // IMPORTANT: Call ready() to dismiss splash screen
              await sdk.actions.ready();
              
            } catch (sdkError) {
              console.log('Farcaster SDK not available, using fallback');
              // Fallback: try to get user data from URL params or localStorage
              const urlParams = new URLSearchParams(window.location.search);
              const fid = urlParams.get('fid');
              const username = urlParams.get('username');
              const displayName = urlParams.get('displayName');
              
              if (fid) {
                setCurrentUser({
                  fid: parseInt(fid),
                  username: username || 'unknown',
                  displayName: displayName || 'Unknown User',
                  pfpUrl: '',
                  verifiedAddresses: { ethAddresses: [] }
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('Farcaster miniapp initialization failed:', error);
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
};