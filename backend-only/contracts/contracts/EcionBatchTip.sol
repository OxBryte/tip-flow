// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EcionBatchTip is Ownable {
    
    event BatchTipExecuted(
        uint256 totalTransfers,
        uint256 gasUsed,
        address[] tokens,
        uint256[] amounts
    );
    
    struct TipData {
        address from;
        address to;
        address token;
        uint256 amount;
        bytes data;
    }
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Execute batch tips for multiple tokens and amounts
     * @param tips Array of tip data containing from, to, token, amount, and data
     */
    function batchTip(TipData[] calldata tips) external onlyOwner {
        uint256 gasStart = gasleft();
        uint256 totalTransfers = tips.length;
        
        address[] memory tokens = new address[](totalTransfers);
        uint256[] memory amounts = new uint256[](totalTransfers);
        
        for (uint256 i = 0; i < totalTransfers; i++) {
            TipData memory tip = tips[i];
            
            // Store token and amount for event
            tokens[i] = tip.token;
            amounts[i] = tip.amount;
            
            // Execute transferFrom for ERC20 tokens
            if (tip.token != address(0)) {
                IERC20 token = IERC20(tip.token);
                require(
                    token.transferFrom(tip.from, tip.to, tip.amount),
                    "Transfer failed"
                );
            }
        }
        
        uint256 gasUsed = gasStart - gasleft();
        
        emit BatchTipExecuted(totalTransfers, gasUsed, tokens, amounts);
    }
    
    /**
     * @dev Emergency withdraw function for stuck tokens
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).transfer(owner(), amount);
        }
    }
}