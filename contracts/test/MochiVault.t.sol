// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {MochiVault} from "../src/MochiVault.sol";
import {MochiStaking} from "../src/MochiStaking.sol";
import {MockUSDG, MockMochi, MockYieldVault} from "./Mocks.sol";

contract MochiVaultTest is Test {
    MockUSDG usdg;
    MockMochi mochi;
    MockYieldVault spark;
    MochiStaking staking;
    MochiVault vault;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant ONE = 1e6; // 1 USDG

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

        usdg.mint(alice, 1_000_000 * ONE);
        usdg.mint(bob, 1_000_000 * ONE);
        vm.prank(alice);
        usdg.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        usdg.approve(address(vault), type(uint256).max);
    }

    function _yield(uint256 amount) internal {
        spark.airdropYield(amount); // raises the underlying share price
    }

    function test_constructor_rejectsMismatchedUnderlying() public {
        MockUSDG other = new MockUSDG();
        MockYieldVault otherVault = new MockYieldVault(IERC20(address(other)));
        vm.expectRevert("underlying asset mismatch");
        new MochiVault(IERC20(address(usdg)), IERC4626(address(otherVault)), 1000, owner);
    }

    function test_feeRecipient_setOnce_andNoFeeBefore() public {
        // a vault with no recipient yet: yield accrues entirely to depositors
        MochiVault v2 = new MochiVault(IERC20(address(usdg)), IERC4626(address(spark)), 1000, owner);
        vm.prank(alice);
        usdg.approve(address(v2), type(uint256).max);
        vm.prank(alice);
        v2.deposit(10_000 * ONE, alice);
        _yield(1000 * ONE);
        v2.accrue();
        assertEq(v2.balanceOf(address(staking)), 0, "no fee without a recipient");
        assertApproxEqAbs(v2.previewRedeem(v2.balanceOf(alice)), 11_000 * ONE, 3, "depositor kept all yield");
        // wiring it ratchets the mark, so old yield is never billed
        vm.prank(owner);
        v2.setFeeRecipient(address(staking));
        v2.accrue();
        assertEq(v2.balanceOf(address(staking)), 0, "pre-wiring yield never charged");
        _yield(1000 * ONE);
        v2.accrue();
        assertGt(v2.balanceOf(address(staking)), 0, "fees flow after wiring");
        // and it is set-once
        vm.prank(owner);
        vm.expectRevert("already set");
        v2.setFeeRecipient(alice);
    }

    function test_deposit_routesToUnderlying() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(1000 * ONE, alice);
        assertEq(shares, 1000 * ONE * 1e12, "18-dec shares via offset");
        assertEq(usdg.balanceOf(address(vault)), 0, "nothing idle");
        assertGt(spark.balanceOf(address(vault)), 0, "underlying position opened");
        assertEq(vault.totalAssets(), 1000 * ONE, "fully accounted");
    }

    function test_withdraw_roundTrip() public {
        vm.startPrank(alice);
        vault.deposit(1000 * ONE, alice);
        uint256 balBefore = usdg.balanceOf(alice);
        vault.withdraw(1000 * ONE, alice, alice);
        vm.stopPrank();
        assertEq(usdg.balanceOf(alice) - balBefore, 1000 * ONE, "exact round trip");
        assertEq(vault.balanceOf(alice), 0, "all shares burned");
    }

    function test_redeem_all() public {
        vm.startPrank(alice);
        uint256 shares = vault.deposit(123_456_789, alice); // odd amount
        uint256 got = vault.redeem(shares, alice, alice);
        vm.stopPrank();
        assertApproxEqAbs(got, 123_456_789, 2, "redeem returns deposit within rounding");
    }

    function test_yield_accruesToShare_andFeeToStaking() public {
        vm.prank(alice);
        vault.deposit(10_000 * ONE, alice);
        _yield(1000 * ONE); // +10% on the underlying
        vault.accrue();

        // 10% fee on 1000 yield -> 100 to staking, 900 to alice's shares
        uint256 stakingAssets = vault.previewRedeem(vault.balanceOf(address(staking)));
        assertApproxEqRel(stakingAssets, 100 * ONE, 0.001e18, "staking holds ~100 USDG of mUSD");
        assertApproxEqRel(vault.previewRedeem(vault.balanceOf(alice)), 10_900 * ONE, 0.001e18, "alice grew ~900");
        assertApproxEqAbs(vault.totalAssets(), 11_000 * ONE, 2);
    }

    function test_accrue_isIdempotent() public {
        vm.prank(alice);
        vault.deposit(10_000 * ONE, alice);
        _yield(1000 * ONE);
        vault.accrue();
        uint256 feeShares = vault.balanceOf(address(staking));
        vault.accrue();
        vault.accrue();
        assertEq(vault.balanceOf(address(staking)), feeShares, "no double charge");
    }

    function test_noFee_onLoss() public {
        vm.prank(alice);
        vault.deposit(10_000 * ONE, alice);
        // simulate a loss by yanking assets out of the mock underlying
        vm.prank(address(spark));
        usdg.transfer(address(0xdead), 500 * ONE);
        vault.accrue();
        assertEq(vault.balanceOf(address(staking)), 0, "no fee on a loss");
        // and recovery back to the old high-water only charges on fresh ground above it
        _yield(500 * ONE);
        vault.accrue();
        assertEq(vault.balanceOf(address(staking)), 0, "recovery to prior level is not new yield");
        _yield(100 * ONE);
        vault.accrue();
        assertGt(vault.balanceOf(address(staking)), 0, "yield above the reference is charged");
    }

    function test_twoDepositors_proportional() public {
        vm.prank(alice);
        vault.deposit(10_000 * ONE, alice);
        _yield(1000 * ONE); // share price rises before bob enters
        vm.prank(bob);
        vault.deposit(10_000 * ONE, bob);
        // bob must not capture pre-entry yield
        assertApproxEqAbs(vault.previewRedeem(vault.balanceOf(bob)), 10_000 * ONE, 2, "bob enters at fair price");
        assertGt(vault.previewRedeem(vault.balanceOf(alice)), 10_890 * ONE, "alice keeps her yield");
    }

    function test_depositCap_leavesIdle_andCatchesUpLater() public {
        spark.setDepositCap(600 * ONE);
        vm.prank(alice);
        vault.deposit(1000 * ONE, alice);
        assertEq(usdg.balanceOf(address(vault)), 400 * ONE, "overflow stays idle");
        assertEq(vault.totalAssets(), 1000 * ONE, "idle still counted");
        // withdrawing served from idle first
        vm.prank(alice);
        vault.withdraw(300 * ONE, alice, alice);
        assertEq(usdg.balanceOf(address(vault)), 100 * ONE);
        // cap lifts, next flow pushes the rest in
        spark.setDepositCap(type(uint256).max);
        vm.prank(bob);
        vault.deposit(ONE, bob);
        assertEq(usdg.balanceOf(address(vault)), 0, "idle swept in");
    }

    function test_inflationAttack_unprofitable() public {
        address attacker = makeAddr("attacker");
        usdg.mint(attacker, 2000 * ONE);
        vm.startPrank(attacker);
        usdg.approve(address(vault), type(uint256).max);
        vault.deposit(1, attacker); // 1 wei of USDG
        usdg.transfer(address(vault), 1000 * ONE); // donation to skew the price
        vm.stopPrank();
        vm.prank(alice);
        uint256 shares = vault.deposit(1000 * ONE, alice);
        assertGt(shares, 0, "victim still gets shares");
        uint256 aliceValue = vault.previewRedeem(shares);
        assertGt(aliceValue, 999 * ONE, "victim loses at most rounding dust");
        vm.startPrank(attacker);
        uint256 back = vault.redeem(vault.balanceOf(attacker), attacker, attacker);
        vm.stopPrank();
        assertLt(back, 1001 * ONE, "attacker cannot profit from the donation");
    }

    function test_maxWithdraw_capsToRealLiquidity() public {
        vm.prank(alice);
        vault.deposit(1000 * ONE, alice);
        assertEq(vault.maxWithdraw(alice), 1000 * ONE);
        assertGe(vault.maxRedeem(alice), vault.balanceOf(alice) - 1);
    }

    function test_setFee_capped_andOwnerOnly() public {
        vm.prank(owner);
        vault.setFee(2000);
        vm.prank(owner);
        vm.expectRevert("fee too high");
        vault.setFee(2001);
        vm.prank(alice);
        vm.expectRevert();
        vault.setFee(0);
    }

    function test_feeChange_settlesAtOldRate() public {
        vm.prank(alice);
        vault.deposit(10_000 * ONE, alice);
        _yield(1000 * ONE);
        vm.prank(owner);
        vault.setFee(2000); // accrues pending yield at 10% first
        uint256 stakingAssets = vault.previewRedeem(vault.balanceOf(address(staking)));
        assertApproxEqRel(stakingAssets, 100 * ONE, 0.001e18, "old-rate settlement");
    }

    function testFuzz_depositWithdraw(uint96 amount) public {
        amount = uint96(bound(amount, 1, 900_000 * ONE));
        vm.startPrank(alice);
        uint256 shares = vault.deposit(amount, alice);
        uint256 got = vault.redeem(shares, alice, alice);
        vm.stopPrank();
        assertApproxEqAbs(got, amount, 2);
    }
}
