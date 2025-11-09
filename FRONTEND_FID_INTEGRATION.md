# Frontend FID Integration Guide

## 🎯 **The Solution**

Instead of trying to get FIDs from wallet addresses (which doesn't work), we get FIDs from the frontend when users interact with the app via Farcaster.

## 🔧 **Frontend Implementation**

### **1. Install Farcaster SDK**
```bash
npm install @farcaster/miniapp-sdk
```

### **2. Add FID Detection to Your App**

```typescript
// In your main app component or where you handle user authentication
import { useEffect, useState } from 'react';

interface FarcasterUser {
  fid: number;
  username: string;
  displayName: string;
  pfpUrl: string;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<FarcasterUser | null>(null);
  const [userAddress, setUserAddress] = useState<string>('');

  useEffect(() => {
    detectFarcasterUser();
  }, []);

  const detectFarcasterUser = async () => {
    try {
      // Check if we're in Farcaster miniapp mode
      const { sdk } = await import('@farcaster/miniapp-sdk');
      const context = await sdk.context;
      
      if (context?.user) {
        // We're in Farcaster! Get real user data
        const farcasterUser: FarcasterUser = {
          fid: context.user.fid,
          username: context.user.username,
          displayName: context.user.displayName,
          pfpUrl: context.user.pfpUrl
        };
        
        setCurrentUser(farcasterUser);
        
        // Get user's wallet address (you'll need to implement this)
        const address = await getUserWalletAddress(); // Your wallet connection logic
        
        if (address) {
          setUserAddress(address);
          
          // Send FID to backend
          await storeUserFid(address, farcasterUser);
        }
        
        console.log('✅ Farcaster user detected:', farcasterUser);
      } else {
        console.log('ℹ️ Not in Farcaster miniapp mode');
      }
    } catch (error) {
      console.log('ℹ️ Farcaster SDK not available:', error);
    }
  };

  const storeUserFid = async (address: string, user: FarcasterUser) => {
    try {
      const response = await fetch('https://tippit-production.up.railway.app/api/store-user-fid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userAddress: address,
          fid: user.fid,
          username: user.username,
          displayName: user.displayName,
          pfpUrl: user.pfpUrl
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('✅ FID stored successfully:', result);
      } else {
        console.error('❌ Failed to store FID:', result);
      }
    } catch (error) {
      console.error('❌ Error storing FID:', error);
    }
  };

  const getUserWalletAddress = async (): Promise<string> => {
    // Implement your wallet connection logic here
    // This should return the user's wallet address
    // Example with MetaMask:
    if (window.ethereum) {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      return accounts[0];
    }
    throw new Error('No wallet found');
  };

  return (
    <div>
      {currentUser ? (
        <div>
          <h1>Welcome, {currentUser.displayName}!</h1>
          <p>FID: {currentUser.fid}</p>
          <p>Username: @{currentUser.username}</p>
          <img src={currentUser.pfpUrl} alt="Profile" width="50" height="50" />
        </div>
      ) : (
        <div>
          <h1>Please open this app in Farcaster</h1>
          <p>To get your FID and start earning tips, open this app via Farcaster.</p>
        </div>
      )}
    </div>
  );
}
```

### **3. Check if User Has FID**

```typescript
const checkUserFid = async (userAddress: string) => {
  try {
    const response = await fetch(`https://tippit-production.up.railway.app/api/get-user-fid/${userAddress}`);
    const result = await response.json();
    
    if (result.hasFid) {
      console.log('✅ User has FID:', result.fid);
      return result.fid;
    } else {
      console.log('❌ User needs to open app in Farcaster to get FID');
      return null;
    }
  } catch (error) {
    console.error('Error checking FID:', error);
    return null;
  }
};
```

## 🚀 **How It Works**

1. **User opens app in Farcaster** → Farcaster SDK detects user context
2. **App gets real FID** → From `sdk.context.user.fid`
3. **App gets wallet address** → From wallet connection (MetaMask, etc.)
4. **App sends both to backend** → Via `/api/store-user-fid` endpoint
5. **Backend stores FID** → Links FID to wallet address in database
6. **Backend updates webhook** → Adds FID to webhook filters
7. **User can now receive tips** → Because they have a FID in the webhook

## 📋 **Backend Endpoints**

- `POST /api/store-user-fid` - Store FID from frontend
- `GET /api/get-user-fid/:userAddress` - Check if user has FID
- `GET /api/debug-fid-lookup/:userAddress` - Debug FID lookup

## ✅ **Expected Result**

Once users open your app in Farcaster:
- ✅ Their FID gets stored in the database
- ✅ They get added to webhook filters automatically
- ✅ They can receive tips when others interact with their content
- ✅ No more "No FID found" errors

**This is the correct way to get FIDs - from the frontend when users are actually using Farcaster!** 🚀