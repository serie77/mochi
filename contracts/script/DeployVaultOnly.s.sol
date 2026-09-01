// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {MochiVault} from "../src/MochiVault.sol";

/// deploy the vault BEFORE the token exists. depositors keep 100% of yield until
/// the staking contract is wired with DeployStaking.s.sol after launch.
///   forge script script/DeployVaultOnly.s.sol --tc DeployVaultOnly --rpc-url robinhood --broadcast
contract DeployVaultOnly is Script {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant SPARK_SPUSDG = 0xde770c84FE66E063336b31737cFE9790f18c4087;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);
        MochiVault vault = new MochiVault(IERC20(USDG), IERC4626(SPARK_SPUSDG), 1000, deployer);
        vm.stopBroadcast();
        console.log("VAULT_CA=%s", address(vault));
        console.log("owner:", deployer);
    }
}
