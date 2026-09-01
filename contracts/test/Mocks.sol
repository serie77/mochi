// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626, IERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

contract MockUSDG is ERC20 {
    constructor() ERC20("Global Dollar", "USDG") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockMochi is ERC20 {
    constructor() ERC20("mochi", "MOCHI") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// 4626 whose share price can be pushed up by dropping assets on it (totalAssets = balance)
contract MockYieldVault is ERC4626 {
    uint256 public depositCap = type(uint256).max;

    constructor(IERC20 asset_) ERC4626(asset_) ERC20("Mock Spark USDG", "spUSDG") {}

    function airdropYield(uint256 amount) external {
        MockUSDG(asset()).mint(address(this), amount);
    }

    function setDepositCap(uint256 cap) external {
        depositCap = cap;
    }

    function maxDeposit(address) public view override returns (uint256) {
        return depositCap;
    }
}
