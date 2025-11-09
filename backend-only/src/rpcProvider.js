// RPC Provider with fallback support
// Tries providers in order: Alchemy -> Infura -> QuickNode -> Public RPC

const { ethers } = require('ethers');

class RPCProviderManager {
  constructor() {
    // List of RPC providers in priority order
    this.providers = [];
    
    // 1. Alchemy (primary - from BASE_RPC_URL)
    if (process.env.BASE_RPC_URL) {
      this.providers.push({
        name: 'Alchemy',
        url: process.env.BASE_RPC_URL,
        priority: 1
      });
    }
    
    // 2. Infura (fallback)
    if (process.env.INFURA_BASE_RPC_URL) {
      this.providers.push({
        name: 'Infura',
        url: process.env.INFURA_BASE_RPC_URL,
        priority: 2
      });
    }
    
    // 3. QuickNode (optional fallback)
    if (process.env.QUICKNODE_BASE_RPC_URL) {
      this.providers.push({
        name: 'QuickNode',
        url: process.env.QUICKNODE_BASE_RPC_URL,
        priority: 3
      });
    }
    
    // 4. Public Base RPC (last resort)
    this.providers.push({
      name: 'Public Base',
      url: 'https://mainnet.base.org',
      priority: 99
    });
    
    // Current active provider
    this.currentProvider = null;
    this.currentProviderIndex = 0;
    
    // Initialize with primary provider
    this.initializeProvider();
  }
  
  initializeProvider() {
    if (this.providers.length === 0) {
      throw new Error('No RPC providers configured');
    }
    
    // Start with primary provider
    this.currentProviderIndex = 0;
    const providerConfig = this.providers[this.currentProviderIndex];
    this.currentProvider = new ethers.JsonRpcProvider(providerConfig.url);
    console.log(`🔌 Initialized RPC provider: ${providerConfig.name} (${providerConfig.url.substring(0, 30)}...)`);
  }
  
  /**
   * Get the current provider (with automatic fallback on failure)
   */
  async getProvider() {
    // Try current provider first
    if (this.currentProvider) {
      try {
        // Quick health check
        await this.currentProvider.getBlockNumber();
        return this.currentProvider;
      } catch (error) {
        console.log(`⚠️ Current provider (${this.providers[this.currentProviderIndex].name}) failed: ${error.message}`);
        return await this.fallbackToNextProvider();
      }
    }
    
    return this.currentProvider;
  }
  
  /**
   * Fallback to next available provider
   */
  async fallbackToNextProvider() {
    // Try next providers in order
    for (let i = this.currentProviderIndex + 1; i < this.providers.length; i++) {
      const providerConfig = this.providers[i];
      console.log(`🔄 Trying fallback provider ${i + 1}/${this.providers.length}: ${providerConfig.name}`);
      
      try {
        const testProvider = new ethers.JsonRpcProvider(providerConfig.url);
        
        // Test the provider
        await testProvider.getBlockNumber();
        
        // If successful, switch to this provider
        this.currentProvider = testProvider;
        this.currentProviderIndex = i;
        console.log(`✅ Switched to provider: ${providerConfig.name}`);
        
        return this.currentProvider;
      } catch (error) {
        console.log(`❌ Provider ${providerConfig.name} failed: ${error.message}`);
        continue;
      }
    }
    
    // All providers failed
    throw new Error('All RPC providers failed. Please check your network connection.');
  }
  
  /**
   * Execute a function with automatic provider fallback
   * @param {Function} fn - Function that takes a provider as argument
   * @param {Number} maxRetries - Maximum retries with fallback
   */
  async executeWithFallback(fn, maxRetries = 3) {
    let lastError = null;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        const provider = await this.getProvider();
        return await fn(provider);
      } catch (error) {
        lastError = error;
        retryCount++;
        
        // Check if it's a provider/RPC error
        const isRpcError = error.message?.includes('503') ||
                          error.message?.includes('Service Unavailable') ||
                          error.message?.includes('SERVER_ERROR') ||
                          error.message?.includes('network') ||
                          error.code === 'SERVER_ERROR' ||
                          error.code === 'NETWORK_ERROR';
        
        if (isRpcError && retryCount < maxRetries) {
          console.log(`⚠️ RPC error on attempt ${retryCount}/${maxRetries}: ${error.message}`);
          
          // Try next provider
          try {
            await this.fallbackToNextProvider();
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            continue;
          } catch (fallbackError) {
            console.log(`❌ Fallback failed: ${fallbackError.message}`);
            // Continue to next retry
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            continue;
          }
        } else {
          // Non-RPC error or max retries reached
          throw error;
        }
      }
    }
    
    throw lastError || new Error('All retries exhausted');
  }
  
  /**
   * Get provider info for logging
   */
  getProviderInfo() {
    if (this.currentProviderIndex < this.providers.length) {
      const current = this.providers[this.currentProviderIndex];
      return {
        name: current.name,
        url: current.url.substring(0, 50) + '...',
        index: this.currentProviderIndex + 1,
        total: this.providers.length
      };
    }
    return { name: 'Unknown', url: 'N/A', index: 0, total: 0 };
  }
}

// Singleton instance
let rpcProviderManager = null;

/**
 * Get or create the RPC provider manager singleton
 */
function getRPCProviderManager() {
  if (!rpcProviderManager) {
    rpcProviderManager = new RPCProviderManager();
  }
  return rpcProviderManager;
}

/**
 * Get a provider with automatic fallback
 */
async function getProvider() {
  const manager = getRPCProviderManager();
  return await manager.getProvider();
}

/**
 * Execute function with automatic provider fallback
 */
async function executeWithFallback(fn, maxRetries = 3) {
  const manager = getRPCProviderManager();
  return await manager.executeWithFallback(fn, maxRetries);
}

module.exports = {
  getProvider,
  executeWithFallback,
  getRPCProviderManager,
  RPCProviderManager
};
