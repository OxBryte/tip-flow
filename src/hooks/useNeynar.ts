import { useState, useEffect } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface FarcasterUser {
  fid: number;
  username: string;
  displayName: string;
  pfp: {
    url: string;
  };
  profile: {
    bio: {
      text: string;
    };
  };
  verifiedAddresses: {
    ethAddresses: string[];
  };
}

export const useNeynar = () => {
  // Address will be provided by Farcaster miniapp context
  const [user, setUser] = useState<FarcasterUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get user by verified Ethereum address (via backend)
  const getUserByAddress = async (ethAddress: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/neynar/user/by-address/${ethAddress}`);

      if (!response.ok) {
        throw new Error('User not found');
      }

      const data = await response.json();
      return data.user;
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  };

  // Get user interactions (likes, recasts, etc.) via backend
  const getUserInteractions = async (fid: number, castHash: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/neynar/cast/${castHash}`);

      const data = await response.json();
      return {
        likes: data.cast.reactions.likes || [],
        recasts: data.cast.reactions.recasts || [],
        replies: data.cast.replies || [],
      };
    } catch (error) {
      console.error('Error fetching interactions:', error);
      return null;
    }
  };

  // Subscribe to webhooks for real-time updates
  const subscribeToWebhooks = async (fid: number) => {
    try {
      const response = await fetch('/api/neynar/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fid,
          webhookUrl: `${window.location.origin}/api/neynar/webhook`,
          subscription: {
            'cast.created': true,
            'reaction.created': true,
            'follow.created': true,
          },
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Error subscribing to webhooks:', error);
      return false;
    }
  };

  // User data will be loaded when needed via getUserByAddress function

  return {
    user,
    isLoading,
    getUserByAddress,
    getUserInteractions,
    subscribeToWebhooks,
  };
};