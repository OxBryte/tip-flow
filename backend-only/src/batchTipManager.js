// Advanced batch tip manager (like the sophisticated tipping app)
// Handles multiple tokens, NFTs, and complex batch operations

const { ethers } = require('ethers');

class BatchTipManager {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    
    // Batch tip contract ABI
    this.batchTipABI = [
      {
        "inputs": [
          {
            "components": [
              {
                "internalType": "address",
                "name": "from",
                "type": "address"
              },
              {
                "internalType": "address", 
                "name": "to",
                "type": "address"
              },
              {
                "internalType": "address",
                "name": "token",
                "type": "address"
              },
              {
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
              },
              {
                "internalType": "bytes",
                "name": "data",
                "type": "bytes"
              }
            ],
            "internalType": "struct EcionBatchTip.TipData[]",
            "name": "tips",
            "type": "tuple[]"
          }
        ],
        "name": "batchTip",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "owner",
        "outputs": [
          {
            "internalType": "address",
            "name": "",
            "type": "address"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      }
    ];
    
    // Contract address (will be deployed)
    this.contractAddress = '0x0000000000000000000000000000000000000000';
  }
  
  /**
   * Execute batch tips for multiple tokens
   * @param {Array} tips - Array of tip objects with from, to, token, amount, data
   * @returns {Promise<Object>} - Transaction result
   */
  async executeBatchTips(tips) {
    try {
      console.log(`🎯 Executing advanced batch tips: ${tips.length} tips`);
      
      // Create batch tip contract instance
      const batchContract = new ethers.Contract(
        this.contractAddress, 
        this.batchTipABI, 
        this.wallet
      );
      
      // Prepare tip data
      const tipData = tips.map(tip => ({
        from: tip.from,
        to: tip.to,
        token: tip.token,
        amount: tip.amount,
        data: tip.data || '0x'
      }));
      
      console.log(`📋 Tip data prepared:`, JSON.stringify(tipData, null, 2));
      
      // Execute batch tip
      const tx = await batchContract.batchTip(tipData, {
        gasLimit: 2000000
      });
      
      console.log(`✅ Batch tip transaction submitted: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        console.log(`✅ Batch tip confirmed: ${tx.hash} (Gas: ${receipt.gasUsed.toString()})`);
        
        return {
          success: true,
          hash: tx.hash,
          gasUsed: receipt.gasUsed.toString(),
          type: 'batch_tip'
        };
      } else {
        throw new Error('Batch tip transaction reverted');
      }
      
    } catch (error) {
      console.log(`❌ Batch tip failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Prepare tip data for USDC transfers
   * @param {Array} transfers - Array of transfer objects
   * @returns {Array} - Formatted tip data
   */
  prepareUSDCTips(transfers) {
    return transfers.map(transfer => ({
      from: transfer.from,
      to: transfer.to,
      token: transfer.tokenAddress,
      amount: transfer.amount,
      data: '0x' // No additional data for USDC
    }));
  }
  
  /**
   * Prepare tip data for multiple token types
   * @param {Array} transfers - Array of transfer objects with different tokens
   * @returns {Array} - Formatted tip data
   */
  prepareMultiTokenTips(transfers) {
    return transfers.map(transfer => ({
      from: transfer.from,
      to: transfer.to,
      token: transfer.tokenAddress,
      amount: transfer.amount,
      data: transfer.data || '0x'
    }));
  }
}

module.exports = BatchTipManager;