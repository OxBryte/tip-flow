// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

abstract contract Ownable {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        _transferOwnership(msg.sender);
    }

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    function _checkOwner() internal view virtual {
        require(owner() == msg.sender, "Ownable: caller is not the owner");
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

contract EcionBatch is Ownable {
    mapping(address => bool) private _executors;

    modifier onlyExecutor() {
        require(_executors[msg.sender], "Only executors");
        _;
    }

    constructor() Ownable() {}

    function batchTip(
        address[] calldata froms, 
        address[] calldata tos, 
        address[] calldata tokens,
        uint[] calldata amounts
    ) external onlyExecutor returns (bool[] memory) {
        uint256 length = froms.length;
        bool[] memory success = new bool[](length);
        
        for (uint i = 0; i < length; ) {
            if (amounts[i] > 0 && tokens[i] != address(0)) {
                try IERC20(tokens[i]).transferFrom(froms[i], tos[i], amounts[i]) {
                    success[i] = true;
                } catch {
                    success[i] = false;
                }
            } else {
                success[i] = false;
            }
            unchecked { ++i; }
        }
        
        return success;
    }

    function addExecutor(address executor) external onlyOwner {
        _executors[executor] = true;
    }
    
    function removeExecutor(address executor) external onlyOwner {
        _executors[executor] = false;
    }
    
    function isExecutor(address executor) external view returns (bool) {
        return _executors[executor];
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else {
            IERC20(token).transfer(owner(), amount);
        }
    }
}