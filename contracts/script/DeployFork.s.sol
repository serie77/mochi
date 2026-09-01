// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MochiVault} from "../src/MochiVault.sol";
import {MochiStaking} from "../src/MochiStaking.sol";

contract ForkMochi is ERC20 {
    constructor() ERC20("mochi", "MOCHI") {
        _mint(msg.sender, 1_000_000_000 ether);
    }
}

/// local-fork rehearsal deploy: mock $MOCHI + the real vault/staking pair against live spark.
///   forge script script/DeployFork.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
///     --private-key <anvil key>
contract DeployFork is Script {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant SPARK_SPUSDG = 0xde770c84FE66E063336b31737cFE9790f18c4087;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        vm.startBroadcast(pk);
        ForkMochi token = new ForkMochi();
        MochiStaking staking = new MochiStaking(IERC20(address(token)), deployer);
        MochiVault vault = new MochiVault(IERC20(USDG), IERC4626(SPARK_SPUSDG), 1000, deployer);
        vault.setFeeRecipient(address(staking));
        staking.setRewardToken(IERC20(address(vault)));
        vm.stopBroadcast();
        console.log("MOCHI_CA=%s", address(token));
        console.log("STAKING_CA=%s", address(staking));
        console.log("VAULT_CA=%s", address(vault));
    }
}
