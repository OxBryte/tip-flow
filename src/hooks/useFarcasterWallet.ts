import { useConnect, useAccount, useDisconnect } from 'wagmi';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export const useFarcasterWallet = () => {
  const { connect, connectors, isPending } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  
  const [isInFarcaster, setIsInFarcaster] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  // Check if we're in Farcaster miniapp and call ready()
  useEffect(() => {
    const checkFarcaster = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const isMini = await sdk.isInMiniApp();
        setIsInFarcaster(isMini);
        
        if (isMini) {
          // CRITICAL: Call ready() to dismiss splash screen and initialize embeds
          try {
            await sdk.actions.ready();
            console.log('✅ SDK ready() called successfully - embeds should be available');
          } catch (readyError) {
            console.log('❌ SDK ready() error:', readyError);
          }
          
          // Get user context if in miniapp
          try {
            const context = await sdk.context;
            if (context?.user) {
              setUserProfile(context.user);
            }
            
            // Handle cast embed context - proper implementation
            if (context && 'cast' in context && context.cast) {
              console.log('✅ Cast embed context detected:', context.cast);
              // Set cast context for embed handling
              (window as any).farcasterCastContext = context.cast;
              
              // Signal that we're handling cast embeds
              (window as any).farcasterCastEmbedHandled = true;
              (window as any).farcasterMiniappEmbedReady = true;
            }
            
            // Additional context handling for embed validation
            if (context) {
              // Set global context for embed validation
              (window as any).farcasterContext = context;
              (window as any).farcasterMiniappContext = context;
              
              // Signal embed support
              (window as any).farcasterEmbedSupported = true;
              (window as any).farcasterMiniappEmbedSupported = true;
              
              // Check if composeCast is available for embeds
              if (sdk?.actions?.composeCast && typeof sdk.actions.composeCast === 'function') {
                console.log('✅ Embed Present: composeCast action available');
                (window as any).farcasterEmbedPresent = true;
                (window as any).farcasterEmbedValid = true;
              } else {
                console.log('❌ Embed Present: composeCast action not available');
                (window as any).farcasterEmbedPresent = false;
                (window as any).farcasterEmbedValid = false;
              }
            }
          } catch (e) {
            console.log('Could not get user context:', e);
          }
        }
      } catch (e) {
        console.log('Not in Farcaster miniapp');
        setIsInFarcaster(false);
      }
    };

    checkFarcaster();
  }, []);

  // Connect with Farcaster
  const connectWallet = async () => {
    try {
      console.log('Attempting to connect Farcaster wallet...');
      const farcasterConnector = connectors.find(c => c.id === 'farcaster');
      
      if (farcasterConnector) {
        await connect({ connector: farcasterConnector });
        console.log('✅ Connected to Farcaster wallet');
        toast.success('Connected!', { duration: 2000 });
      } else {
        throw new Error('Farcaster connector not found');
      }
    } catch (error: any) {
      console.error('❌ Farcaster connection failed:', error);
      
      // User-friendly error messages
      if (error.message?.includes('User rejected') || error.message?.includes('cancelled')) {
        toast.error('Connection cancelled by user', { duration: 2000 });
      } else if (error.message?.includes('Farcaster mobile app')) {
        toast.error('Please open this app in Farcaster mobile app', { duration: 2000 });
      } else {
        toast.error('Failed to connect wallet: ' + error.message, { duration: 2000 });
      }
      
      throw error;
    }
  };

  // Disconnect wallet
  const disconnectWallet = async () => {
    try {
      await disconnect();
      setUserProfile(null);
      toast.success('Disconnected', { duration: 1500 });
    } catch (error) {
      console.error('Disconnect error:', error);
      toast.error('Failed to disconnect wallet', { duration: 2000 });
    }
  };

  // Auto-connect if in Farcaster miniapp
  useEffect(() => {
    const autoConnect = async () => {
      try {
        const { sdk } = await import('@farcaster/miniapp-sdk');
        const isMini = await sdk.isInMiniApp();
        if (isMini && !isConnected) {
          console.log('Auto-connecting to Farcaster...');
          // Auto-connect without showing toast to avoid duplicate messages
          const farcasterConnector = connectors.find(c => c.id === 'farcaster');
          if (farcasterConnector) {
            await connect({ connector: farcasterConnector });
            console.log('✅ Auto-connected to Farcaster wallet');
          }
        }
      } catch (e) {
        // Not in miniapp, ignore
      }
    };
    
    if (isInFarcaster && !isConnected) {
      autoConnect();
    }
  }, [isInFarcaster, isConnected]);

  return {
    isInFarcaster,
    userProfile,
    isConnected,
    address,
    connectWallet,
    disconnectWallet,
    isPending,
    isLoading: isPending,
    currentUser: userProfile,
    isMiniapp: isInFarcaster
  };
};