# Farcaster Mini App Deployment Guide

## 🚀 Quick Setup Steps

### 1. Create Hosted Manifest (Easy Method)

1. **Visit the Farcaster Developer Tools**: https://farcaster.xyz/~/developers/mini-apps/manifest

2. **Fill in your app details**:
   ```
   Domain: ecion.vercel.app (or your custom domain)
   App Name: Ecion
   Description: Tip your audience for engagement on Farcaster
   Category: social
   Tags: tipping, rewards, engagement, farcaster
   
   Icon URL: https://ecion.vercel.app/icon.png
   Home URL: https://ecion.vercel.app
   Splash Image: https://ecion.vercel.app/splash.png
   Screenshots: Add 2-3 screenshots of your app
   
   Required Capabilities:
   - actions.signIn
   - wallet.getEthereumProvider
   - wallet.switchChain
   ```

3. **Get your Hosted Manifest ID** (e.g., `1234567890`)

4. **Update the redirect URLs**:
   - Replace `PLACEHOLDER_MANIFEST_ID` in `next.config.js` with your actual ID
   - Replace `PLACEHOLDER_MANIFEST_ID` in `backend-only/src/index.js` with your actual ID

### 2. Alternative: Manual Manifest File

If you prefer to manage the manifest yourself, create `public/.well-known/farcaster.json`:

```json
{
  "miniapp": {
    "version": "1",
    "name": "Ecion",
    "iconUrl": "https://ecion.vercel.app/icon.png",
    "homeUrl": "https://ecion.vercel.app",
    "imageUrl": "https://ecion.vercel.app/og-image.png",
    "buttonTitle": "💰 Start Tipping",
    "splashImageUrl": "https://ecion.vercel.app/splash.png",
    "splashBackgroundColor": "#fef3c7",
    "requiredChains": ["eip155:8453"],
    "requiredCapabilities": [
      "actions.signIn",
      "wallet.getEthereumProvider",
      "wallet.switchChain"
    ],
    "subtitle": "Tip your audience for engagement",
    "description": "Boost your casts by tipping engagers for their interactions on Farcaster.",
    "primaryCategory": "social",
    "tags": ["tipping", "rewards", "engagement", "farcaster"],
    "ogTitle": "Ecion - Tip Your Audience",
    "ogDescription": "Boost your casts by tipping engagers for their interactions on Farcaster.",
    "ogImageUrl": "https://ecion.vercel.app/og-image.png"
  }
}
```

### 3. Domain Verification

1. **Choose your domain**: Use `ecion.vercel.app` (your current Vercel deployment)
2. **Verify ownership**: The manifest will be automatically verified when you deploy
3. **Test the manifest**: Visit `https://ecion.vercel.app/.well-known/farcaster.json`

### 4. Deploy and Test

1. **Deploy your changes**:
   ```bash
   git add .
   git commit -m "Add Farcaster Mini App manifest support"
   git push origin main
   ```

2. **Test the manifest**:
   - Visit: `https://ecion.vercel.app/.well-known/farcaster.json`
   - Should redirect to your hosted manifest or show the JSON

3. **Submit to Farcaster**:
   - Your app will be discoverable in Farcaster Mini App stores
   - Users can find it by searching for "Ecion" or "tipping"

## 🎯 Benefits of Farcaster Mini Apps

- **Discoverable**: Users can find your app in Farcaster's app store
- **Native Integration**: Works seamlessly within Farcaster clients
- **Verified Developer**: You get credit as the app developer
- **Developer Rewards**: Eligible for Warpcast Developer Rewards
- **Better UX**: Users don't need to leave Farcaster to use your app

## 🔧 Technical Details

### Required Capabilities
- `actions.signIn`: For Farcaster authentication
- `wallet.getEthereumProvider`: For wallet interactions
- `wallet.switchChain`: To switch to Base network

### Supported Chains
- Base (eip155:8453) - Your app uses USDC on Base

### App Structure
- Homepage: Shows recent casts from tippers
- Settings: Configure tipping amounts and criteria
- Leaderboard: Top tippers and earners

## 📱 Next Steps After Deployment

1. **Create app assets**:
   - App icon (512x512px)
   - Splash screen image
   - Screenshots for the app store
   - Open Graph image

2. **Submit for review** (if required):
   - Some apps may need manual review
   - Usually approved within 24-48 hours

3. **Promote your app**:
   - Share in Farcaster channels
   - Create a cast about your app
   - Add to relevant communities

## 🆘 Troubleshooting

### Manifest not found
- Check that `/.well-known/farcaster.json` is accessible
- Verify the redirect is working
- Make sure your domain is correct

### App not appearing in store
- Wait 24-48 hours for indexing
- Check that all required fields are filled
- Verify your domain matches exactly

### Authentication issues
- Ensure `actions.signIn` is in requiredCapabilities
- Check that your app handles Farcaster authentication properly