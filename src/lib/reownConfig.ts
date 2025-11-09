import { createAppKit } from '@reown/appkit'
import { base, mainnet, arbitrum } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { createConfig, http, type Config } from 'wagmi'
import { injected, coinbaseWallet } from 'wagmi/connectors'
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector'

// Get the project ID from environment
const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID

// Get API keys from environment
const ALCHEMY_API_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || 'your-alchemy-key'

// Check if we have a valid Reown project ID
const hasValidProjectId = projectId && projectId !== 'YOUR_REOWN_PROJECT_ID_HERE' && projectId.length > 10

console.log('🔧 Reown Configuration:', {
  projectId: projectId ? `${projectId.substring(0, 8)}...` : 'Not set',
  hasValidProjectId,
  mode: hasValidProjectId ? 'Reown AppKit' : 'Fallback wagmi'
})

// Create wagmi configuration
let wagmiConfig: Config
let appKitInstance: any = null

if (hasValidProjectId) {
  // Use Reown AppKit adapter if we have a valid project ID
  const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks: [base, mainnet, arbitrum],
    connectors: [
      farcasterMiniApp(),  // 🔑 This is the key Farcaster connector
      injected(),
      coinbaseWallet({
        appName: 'Ecion',
        preference: 'smartWalletOnly'
      })
    ]
  })

  // Define metadata
  const metadata = {
    name: 'Ecion',
    description: 'Tip Farcaster engagers with any Base token',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://ecion.app',
    icons: ['https://ecion.app/ecion.png']
  }

  // Create modal
  appKitInstance = createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks: [base, mainnet, arbitrum],
    defaultNetwork: base,
    metadata,
    features: {
      analytics: true,
      email: false,
      socials: false,
      swaps: false
    },
    themeMode: 'light',
    themeVariables: {
      '--w3m-font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      '--w3m-accent': '#7C65C1',
      '--w3m-border-radius-master': '8px'
    }
  })
  
  // Make appKit available globally for direct access
  if (typeof window !== 'undefined') {
    (window as any).reownAppKit = appKitInstance;
  }

  // Export the wagmi config from the adapter
  wagmiConfig = wagmiAdapter.wagmiConfig
} else {
  // Fallback to regular wagmi config if no Reown project ID
  console.warn('⚠️ Reown Project ID not configured. Using fallback wagmi configuration.')
  
  wagmiConfig = createConfig({
    chains: [base, mainnet, arbitrum],
    connectors: [
      farcasterMiniApp(),  // 🔑 Key Farcaster connector
      injected(),
      coinbaseWallet({
        appName: 'Ecion',
        preference: 'smartWalletOnly'
      })
    ],
    transports: {
      [base.id]: http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`),
      [mainnet.id]: http(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`),
      [arbitrum.id]: http(`https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`)
    }
  })
}

export { wagmiConfig, hasValidProjectId as isReownInitialized, appKitInstance }