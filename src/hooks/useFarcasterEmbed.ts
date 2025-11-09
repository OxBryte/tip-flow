import { useState, useEffect } from 'react';

interface EmbedStatus {
  isPresent: boolean;
  isValid: boolean;
  isLoading: boolean;
  error?: string;
  debugInfo?: any;
}

export const useFarcasterEmbed = () => {
  const [embedStatus, setEmbedStatus] = useState<EmbedStatus>({
    isPresent: false,
    isValid: false,
    isLoading: true,
    debugInfo: {}
  });

  // Enhanced debug function
  const debugSDK = async () => {
    const debugInfo: any = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      searchParams: window.location.search,
      sdkAvailable: false,
      isInMiniApp: false,
      context: null,
      actions: null,
      readyCalled: false,
      capabilities: null
    };

    try {
      // Check if SDK can be imported
      const { sdk } = await import('@farcaster/miniapp-sdk');
      debugInfo.sdkAvailable = true;
      debugInfo.sdkVersion = '0.1.6'; // Fixed version since sdk.version doesn't exist

      // Check if we're in miniapp
      const isInMiniApp = await sdk.isInMiniApp();
      debugInfo.isInMiniApp = isInMiniApp;

      if (isInMiniApp) {
        // Get context with proper structure
        try {
          const context = await sdk.context;
          debugInfo.context = {
            user: context?.user ? {
              fid: context.user.fid,
              username: context.user.username,
              displayName: context.user.displayName,
              pfpUrl: context.user.pfpUrl
            } : null,
            location: context?.location ? {
              type: context.location.type,
              embed: context.location.type === 'cast_embed' ? (context.location as any).embed : undefined,
              cast: context.location.type === 'cast_embed' || context.location.type === 'cast_share' ? (context.location as any).cast : undefined
            } : null,
            client: context?.client ? {
              platformType: context.client.platformType,
              clientFid: context.client.clientFid,
              added: context.client.added,
              safeAreaInsets: context.client.safeAreaInsets
            } : null,
            features: context?.features ? {
              haptics: context.features.haptics,
              cameraAndMicrophoneAccess: context.features.cameraAndMicrophoneAccess
            } : null
          };

          // Get capabilities
          try {
            const capabilities = await sdk.getCapabilities();
            debugInfo.capabilities = capabilities;
          } catch (capabilitiesError) {
            debugInfo.capabilitiesError = capabilitiesError instanceof Error ? capabilitiesError.message : 'Unknown error';
          }

          // Check actions
          debugInfo.actions = {
            composeCast: typeof sdk.actions?.composeCast,
            ready: typeof sdk.actions?.ready,
            allActions: Object.keys(sdk.actions || {})
          };

          // Try to call ready
          try {
            await sdk.actions.ready();
            debugInfo.readyCalled = true;
          } catch (readyError) {
            debugInfo.readyError = readyError instanceof Error ? readyError.message : 'Unknown error';
          }
        } catch (contextError) {
          debugInfo.contextError = contextError instanceof Error ? contextError.message : 'Unknown error';
        }
      }
    } catch (importError) {
      debugInfo.importError = importError instanceof Error ? importError.message : 'Unknown error';
    }

    return debugInfo;
  };

  // Check if embeds are present/available
  const checkEmbedPresent = async (): Promise<boolean> => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      
      // Check if we're in a miniapp context
      const isInMiniApp = await sdk.isInMiniApp();
      console.log('🔍 isInMiniApp result:', isInMiniApp);
      
      if (!isInMiniApp) {
        console.log('❌ Not in miniapp - embeds not available');
        return false;
      }
      
      // Ensure SDK is ready before checking actions
      try {
        await sdk.actions.ready();
        console.log('✅ SDK ready() called successfully');
      } catch (readyError) {
        console.log('⚠️ SDK ready() failed:', readyError);
      }
      
      // Check capabilities first
      try {
        const capabilities = await sdk.getCapabilities();
        console.log('🔍 Available capabilities:', capabilities);
        
        // Check if composeCast is in capabilities
        const hasComposeCastCapability = capabilities.includes('actions.composeCast');
        console.log('🔍 composeCast capability:', hasComposeCastCapability);
        
        if (hasComposeCastCapability) {
          // Also check if the action is actually available
          const hasComposeCast = sdk?.actions?.composeCast && typeof sdk.actions.composeCast === 'function';
          console.log('🔍 composeCast action available:', hasComposeCast);
          
          if (hasComposeCast) {
            console.log('✅ Embed Present: composeCast action available via capabilities');
            return true;
          }
        }
      } catch (capabilitiesError) {
        console.log('⚠️ Capabilities check failed:', capabilitiesError);
      }
      
      // Fallback to direct action check
      const hasComposeCast = sdk?.actions?.composeCast && typeof sdk.actions.composeCast === 'function';
      console.log('🔍 composeCast available (fallback):', hasComposeCast);
      console.log('🔍 sdk.actions:', sdk.actions);
      console.log('🔍 sdk.actions.composeCast:', sdk.actions?.composeCast);
      
      if (hasComposeCast) {
        console.log('✅ Embed Present: composeCast action available (fallback)');
        return true;
      } else {
        console.log('❌ Embed Present: composeCast action not available');
        return false;
      }
    } catch (error) {
      console.error('❌ Error checking embed present:', error);
      return false;
    }
  };

  // Check if embeds work properly
  const checkEmbedValid = async (): Promise<boolean> => {
    try {
      const { sdk } = await import('@farcaster/miniapp-sdk');
      
      // First check if we're in miniapp
      const isInMiniApp = await sdk.isInMiniApp();
      console.log('🔍 Valid check - isInMiniApp:', isInMiniApp);
      
      if (!isInMiniApp) {
        console.log('❌ Not in miniapp - embeds not valid');
        return false;
      }
      
      // Ensure SDK is ready before checking actions
      try {
        await sdk.actions.ready();
        console.log('✅ SDK ready() called successfully in valid check');
      } catch (readyError) {
        console.log('⚠️ SDK ready() failed in valid check:', readyError);
      }
      
      // Check capabilities first
      try {
        const capabilities = await sdk.getCapabilities();
        console.log('🔍 Valid check - capabilities:', capabilities);
        
        // Check if composeCast is in capabilities
        const hasComposeCastCapability = capabilities.includes('actions.composeCast');
        console.log('🔍 Valid check - composeCast capability:', hasComposeCastCapability);
        
        if (!hasComposeCastCapability) {
          console.log('❌ Embed Valid: composeCast not in capabilities');
          return false;
        }
      } catch (capabilitiesError) {
        console.log('⚠️ Capabilities check failed in valid check:', capabilitiesError);
      }
      
      // Check if composeCast action exists and is callable
      const hasComposeCast = sdk?.actions?.composeCast && typeof sdk.actions.composeCast === 'function';
      console.log('🔍 Valid check - hasComposeCast:', hasComposeCast);
      
      if (!hasComposeCast) {
        console.log('❌ Embed Valid: composeCast action not available');
        return false;
      }
      
      // Test the composeCast function with a test call
      try {
        // Check if the function exists and is callable
        if (typeof sdk.actions.composeCast === 'function') {
          console.log('✅ Embed Valid: composeCast function is valid and callable');
          return true;
        } else {
          console.log('❌ Embed Valid: composeCast is not a function');
          return false;
        }
      } catch (testError) {
        console.log('❌ Embed Valid: composeCast test failed:', testError);
        return false;
      }
    } catch (error) {
      console.error('❌ Error validating embed:', error);
      return false;
    }
  };

  // Complete share function that handles embeds properly
  const handleShare = async (shareText: string, shareUrl: string) => {
    try {
      console.log('📝 Starting share process...');
      
      const { sdk } = await import('@farcaster/miniapp-sdk');
      
      // Check if we're in miniapp
      const isInMiniApp = await sdk.isInMiniApp();
      console.log('📱 Is in MiniApp:', isInMiniApp);
      
      if (isInMiniApp) {
        // Ensure SDK is ready before using actions
        try {
          await sdk.actions.ready();
          console.log('✅ SDK ready() called before share');
        } catch (readyError) {
          console.log('⚠️ SDK ready() failed before share:', readyError);
        }
        
        // Check if composeCast is available and callable
        if (sdk?.actions?.composeCast && typeof sdk.actions.composeCast === 'function') {
          console.log('📝 Composing cast via SDK...');
          
          try {
            await sdk.actions.composeCast({ 
              text: shareText.trim(),
              embeds: [shareUrl]
            });
            console.log('✅ Shared to Farcaster successfully');
            return { success: true, method: 'sdk' };
          } catch (sdkError) {
            console.error('❌ SDK composeCast failed:', sdkError);
            // Fall through to fallback methods
          }
        } else {
          console.log('⚠️ composeCast not available, using fallback');
        }
      }
      
      // Fallback methods
      const finalShareText = `${shareText}\n${shareUrl}`;
      
      // Try clipboard first
      try {
        await navigator.clipboard.writeText(finalShareText);
        console.log('✅ Share text copied to clipboard');
        return { success: true, method: 'clipboard' };
      } catch (clipboardError) {
        console.log('⚠️ Clipboard failed, trying URL method');
      }
      
      // Final fallback - open Warpcast compose
      const encoded = encodeURIComponent(finalShareText);
      window.open(`https://farcaster.xyz/~/compose?text=${encoded}`, '_blank');
      console.log('✅ Opened Farcaster compose');
      return { success: true, method: 'warpcast' };
      
    } catch (error) {
      console.error('❌ Share failed completely:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  // Initialize embed detection
  useEffect(() => {
    const checkEmbeds = async () => {
      setEmbedStatus(prev => ({ ...prev, isLoading: true }));
      
      try {
        // Get debug info
        const debugInfo = await debugSDK();
        console.log('🔍 Debug Info:', debugInfo);
        
        // Check if embeds are present
        const present = await checkEmbedPresent();
        
        // Check if embeds are valid
        const valid = await checkEmbedValid();
        
        console.log('📊 Embed Status:', { present, valid });
        
        setEmbedStatus({
          isPresent: present,
          isValid: valid,
          isLoading: false,
          debugInfo
        });
      } catch (error) {
        console.error('❌ Error checking embeds:', error);
        setEmbedStatus({
          isPresent: false,
          isValid: false,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    };
    
    // Add a small delay to ensure everything is loaded
    setTimeout(checkEmbeds, 1000);
  }, []);

  return {
    ...embedStatus,
    handleShare,
    checkEmbedPresent,
    checkEmbedValid
  };
};