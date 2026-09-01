// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {MochiVault} from "../src/MochiVault.sol";
import {MochiStaking} from "../src/MochiStaking.sol";

/// deploy to robinhood chain:
///   export MOCHI_CA=0x...          # the $MOCHI token (after it launches on pons)
///   export PRIVATE_KEY=0x...       # deployer key with a few dollars of ETH on chain 4663
///   forge script script/Deploy.s.sol --rpc-url robinhood --broadcast
contract Deploy is Script {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant SPARK_SPUSDG = 0xde770c84FE66E063336b31737cFE9790f18c4087;
    uint256 constant FEE_BPS = 1000; // 10% of yield

    function run() external {
        address mochiToken = vm.envAddress("MOCHI_CA");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        MochiStaking staking = new MochiStaking(IERC20(mochiToken), deployer);
        MochiVault vault = new MochiVault(IERC20(USDG), IERC4626(SPARK_SPUSDG), FEE_BPS, deployer);
        vault.setFeeRecipient(address(staking));
        staking.setRewardToken(IERC20(address(vault)));
        vm.stopBroadcast();

        console.log("MochiStaking:", address(staking));
        console.log("MochiVault (mUSD):", address(vault));
        console.log("owner:", deployer);
        console.log("set in .env -> VAULT_CA=%s  STAKING_CA=%s", address(vault), address(staking));
    }
}
