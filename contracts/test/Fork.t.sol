// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {MochiVault} from "../src/MochiVault.sol";
import {MochiStaking} from "../src/MochiStaking.sol";
import {MockMochi} from "./Mocks.sol";

/// run against a fork of robinhood chain (4663):
///   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --hardfork shanghai
///   forge test --match-contract ForkTest --fork-url http://127.0.0.1:8545
contract ForkTest is Test {
    IERC20 constant USDG = IERC20(0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168);
    IERC4626 constant SPARK = IERC4626(0xde770c84FE66E063336b31737cFE9790f18c4087); // spUSDG

    MochiVault vault;
    MochiStaking staking;
    MockMochi mochi;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant ONE = 1e6;

    function setUp() public {
        mochi = new MockMochi();
        staking = new MochiStaking(IERC20(address(mochi)), owner);
        vault = new MochiVault(USDG, SPARK, 1000, owner);
        vm.startPrank(owner);
        vault.setFeeRecipient(address(staking));
        staking.setRewardToken(IERC20(address(vault)));
        vm.stopPrank();

        deal(address(USDG), alice, 100_000 * ONE);
        deal(address(USDG), bob, 100_000 * ONE);
        vm.prank(alice);
        USDG.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        USDG.approve(address(vault), type(uint256).max);
    }

    function test_environment() public view {
        assertEq(block.chainid, 4663, "on robinhood chain");
        assertEq(IERC20Metadata(address(USDG)).decimals(), 6);
        assertEq(SPARK.asset(), address(USDG), "spark vault is on canonical USDG");
        assertGt(SPARK.totalAssets(), 1_000_000 * ONE, "spark has real TVL");
        assertGt(SPARK.maxDeposit(address(vault)), 1_000_000 * ONE, "spark is open to us");
    }

    function test_deposit_opensRealSparkPosition() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(10_000 * ONE, alice);
        assertEq(shares, 10_000 * ONE * 1e12);
        assertGt(SPARK.balanceOf(address(vault)), 0, "real spUSDG held");
        assertLe(USDG.balanceOf(address(vault)), 0, "swept into spark");
        assertApproxEqAbs(vault.totalAssets(), 10_000 * ONE, 2);
    }

    function test_withdraw_pullsBackFromSpark() public {
        vm.startPrank(alice);
        vault.deposit(10_000 * ONE, alice);
        uint256 before = USDG.balanceOf(alice);
        uint256 maxW = vault.maxWithdraw(alice); // spark entry rounding can shave a wei or two
        assertGe(maxW, 10_000 * ONE - 3, "at most rounding dust lost");
        vault.withdraw(maxW, alice, alice);
        vm.stopPrank();
        assertEq(USDG.balanceOf(alice) - before, maxW, "withdrawal pays what it promised");
    }

    function test_redeemAll_roundTrip() public {
        vm.startPrank(alice);
        uint256 shares = vault.deposit(12_345_678, alice);
        uint256 r = vault.maxRedeem(alice);
        assertGe(r, shares - 1e12, "nearly all shares redeemable");
        uint256 got = vault.redeem(r, alice, alice);
        vm.stopPrank();
        assertApproxEqAbs(got, 12_345_678, 3);
    }

    function test_realYield_accrues_andPaysStakers() public {
        mochi.mint(alice, 100 ether);
        vm.startPrank(alice);
        mochi.approve(address(staking), type(uint256).max);
        staking.stake(100 ether);
        vm.stopPrank();
        vm.prank(bob);
        vault.deposit(50_000 * ONE, bob);

        uint256 t0 = vault.totalAssets();
        vm.warp(block.timestamp + 365 days);
        uint256 t1 = vault.totalAssets();
        assertGt(t1, t0, "spark accrues real interest over time");
        // sanity: somewhere between 0.1% and 30% over a year
        assertGt(t1, t0 + t0 / 1000);
        assertLt(t1, t0 + (t0 * 30) / 100);

        vault.accrue();
        uint256 feeShares = vault.balanceOf(address(staking));
        assertGt(feeShares, 0, "fee minted from real yield");
        uint256 feeAssets = vault.previewRedeem(feeShares);
        assertApproxEqRel(feeAssets, (t1 - t0) / 10, 0.02e18, "~10% of the yield");

        vm.prank(alice);
        uint256 rewards = staking.claim();
        assertGt(rewards, 0, "staker paid in mUSD");
        // and the mUSD is redeemable for real USDG
        vm.prank(alice);
        uint256 usdgOut = vault.redeem(rewards, alice, alice);
        assertGt(usdgOut, 0, "rewards redeem to USDG");

        // bob exits with principal + his share of yield
        uint256 bobOut;
        vm.startPrank(bob);
        bobOut = vault.redeem(vault.balanceOf(bob), bob, bob);
        vm.stopPrank();
        assertGt(bobOut, 50_000 * ONE, "depositor left with real yield");
    }

}
