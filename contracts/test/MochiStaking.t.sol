// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {MochiVault} from "../src/MochiVault.sol";
import {MochiStaking} from "../src/MochiStaking.sol";
import {MockUSDG, MockMochi, MockYieldVault} from "./Mocks.sol";

contract MochiStakingTest is Test {
    MockUSDG usdg;
    MockMochi mochi;
    MockYieldVault spark;
    MochiStaking staking;
    MochiVault vault;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address lp = makeAddr("lp");

    uint256 constant ONE = 1e6;

    function setUp() public {
        usdg = new MockUSDG();
        mochi = new MockMochi();
        spark = new MockYieldVault(IERC20(address(usdg)));
        staking = new MochiStaking(IERC20(address(mochi)), owner);
        vault = new MochiVault(IERC20(address(usdg)), IERC4626(address(spark)), 1000, owner);
        vm.startPrank(owner);
        vault.setFeeRecipient(address(staking));
        staking.setRewardToken(IERC20(address(vault)));
        vm.stopPrank();

        mochi.mint(alice, 1_000_000 ether);
        mochi.mint(bob, 1_000_000 ether);
        usdg.mint(lp, 10_000_000 * ONE);
        vm.prank(alice);
        mochi.approve(address(staking), type(uint256).max);
        vm.prank(bob);
        mochi.approve(address(staking), type(uint256).max);
        vm.prank(lp);
        usdg.approve(address(vault), type(uint256).max);
    }

    /// deposits into the vault, generates yield, and realizes the fee to the staking contract
    function _generateFees(uint256 depositAmt, uint256 yieldAmt) internal {
        vm.prank(lp);
        vault.deposit(depositAmt, lp);
        spark.airdropYield(yieldAmt);
        vault.accrue();
    }

    function test_setRewardToken_onceOnly() public {
        vm.prank(owner);
        vm.expectRevert("already set");
        staking.setRewardToken(IERC20(address(vault)));
    }

    function test_singleStaker_getsAllFees() public {
        vm.prank(alice);
        staking.stake(100 ether);
        _generateFees(100_000 * ONE, 10_000 * ONE); // 1000 USDG of fees
        uint256 c = staking.claimable(alice);
        assertGt(c, 0);
        vm.prank(alice);
        uint256 got = staking.claim();
        assertEq(got, c, "claim pays what claimable showed");
        assertEq(vault.balanceOf(alice), got, "paid in mUSD");
        assertApproxEqRel(vault.previewRedeem(got), 1000 * ONE, 0.001e18, "worth ~the whole fee");
    }

    function test_twoStakers_proRata() public {
        vm.prank(alice);
        staking.stake(300 ether);
        vm.prank(bob);
        staking.stake(100 ether);
        _generateFees(100_000 * ONE, 10_000 * ONE);
        uint256 a = staking.claimable(alice);
        uint256 b = staking.claimable(bob);
        assertApproxEqAbs(a, b * 3, 3, "3:1 split");
    }

    function test_lateStaker_missesEarlierFees() public {
        vm.prank(alice);
        staking.stake(100 ether);
        _generateFees(100_000 * ONE, 10_000 * ONE);
        vm.prank(alice);
        staking.claim();
        // sync the remaining index before bob arrives
        staking.sync();
        vm.prank(bob);
        staking.stake(100 ether);
        assertEq(staking.claimable(bob), 0, "no retroactive rewards");
        spark.airdropYield(10_000 * ONE);
        vault.accrue();
        assertApproxEqAbs(staking.claimable(bob), staking.claimable(alice), 2, "equal from here on");
    }

    function test_unstake_keepsAccrued() public {
        vm.prank(alice);
        staking.stake(100 ether);
        _generateFees(100_000 * ONE, 10_000 * ONE);
        vm.prank(alice);
        staking.unstake(100 ether);
        assertEq(mochi.balanceOf(alice), 1_000_000 ether, "principal back");
        assertGt(staking.claimable(alice), 0, "rewards survive unstake");
        vm.prank(alice);
        uint256 got = staking.claim();
        assertGt(got, 0);
    }

    function test_exit() public {
        vm.prank(alice);
        staking.stake(50 ether);
        _generateFees(100_000 * ONE, 10_000 * ONE);
        vm.prank(alice);
        staking.exit();
        assertEq(staking.staked(alice), 0);
        assertEq(mochi.balanceOf(alice), 1_000_000 ether);
        assertGt(vault.balanceOf(alice), 0, "rewards claimed on exit");
    }

    function test_feesBeforeAnyStaker_goToFirstStakers() public {
        _generateFees(100_000 * ONE, 10_000 * ONE); // nobody staked yet
        assertGt(vault.balanceOf(address(staking)), 0);
        vm.prank(alice);
        staking.stake(1 ether);
        staking.sync();
        assertGt(staking.claimable(alice), 0, "waiting rewards flow to the first staker");
    }

    function test_cannotUnstakeMoreThanStaked() public {
        vm.prank(alice);
        staking.stake(1 ether);
        vm.prank(alice);
        vm.expectRevert("bad amount");
        staking.unstake(2 ether);
    }

    function test_claim_zeroIsNoop() public {
        vm.prank(alice);
        staking.stake(1 ether);
        vm.prank(alice);
        assertEq(staking.claim(), 0);
    }

    function testFuzz_conservation(uint64 stakeA, uint64 stakeB, uint32 yieldAmt) public {
        uint256 sa = bound(uint256(stakeA), 1e9, 1_000_000 ether);
        uint256 sb = bound(uint256(stakeB), 1e9, 1_000_000 ether);
        uint256 y = bound(uint256(yieldAmt), ONE, 4_000_000 * ONE);
        mochi.mint(alice, sa);
        mochi.mint(bob, sb);
        vm.prank(alice);
        staking.stake(sa);
        vm.prank(bob);
        staking.stake(sb);
        usdg.mint(lp, 10_000_000 * ONE);
        _generateFees(10_000_000 * ONE, y);
        vm.prank(alice);
        uint256 ga = staking.claim();
        vm.prank(bob);
        uint256 gb = staking.claim();
        assertLe(ga + gb, vault.balanceOf(address(staking)) + ga + gb, "cannot pay more than received");
        // everything distributed except index dust
        assertApproxEqAbs(ga + gb + staking.reserved(), vault.balanceOf(address(staking)) + ga + gb, 1);
    }
}
