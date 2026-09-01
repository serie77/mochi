// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MochiVault} from "../src/MochiVault.sol";
import {MochiStaking} from "../src/MochiStaking.sol";

/// after the token launches: deploy staking and wire it to the already-live vault.
///   export MOCHI_CA=0x... VAULT_CA=0x...
///   forge script script/DeployStaking.s.sol --tc DeployStaking --rpc-url robinhood --broadcast
contract DeployStaking is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address mochiToken = vm.envAddress("MOCHI_CA");
        MochiVault vault = MochiVault(vm.envAddress("VAULT_CA"));
        vm.startBroadcast(pk);
        MochiStaking staking = new MochiStaking(IERC20(mochiToken), deployer);
        staking.setRewardToken(IERC20(address(vault)));
        vault.setFeeRecipient(address(staking));
        vm.stopBroadcast();
        console.log("STAKING_CA=%s", address(staking));
    }
}
