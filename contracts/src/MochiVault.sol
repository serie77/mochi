// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC4626, ERC20, IERC20, IERC4626, Math, SafeERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MochiVault (mUSD)
/// @notice ERC-4626 wrapper that routes USDG into an underlying, open ERC-4626 yield vault
///         (Spark spUSDG on Robinhood Chain). The share price appreciates with the underlying;
///         a performance fee on realized yield is minted as shares to the staking contract, so
///         $MOCHI stakers are paid in mUSD — real yield, never emissions.
/// @dev    No keeper, no rebase, no claim step. Fees accrue lazily inside user interactions
///         against a price-per-share high-water mark, so losses are never charged and recovery
///         back to a previous high is not "yield". The owner can only adjust the fee within a
///         hard cap; funds can never be moved by anyone but their depositor.
contract MochiVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 2_000; // 20% of yield, hard cap
    uint256 private constant WAD = 1e18;

    /// @notice the vault the deposits are routed into (must share our asset)
    IERC4626 public immutable underlying;
    /// @notice receiver of performance-fee shares (the $MOCHI staking contract).
    ///         set exactly once, after the token and staking exist; until then no fee
    ///         is charged and depositors keep 100% of the yield.
    address public feeRecipient;
    /// @notice performance fee taken from positive yield, in bps
    uint256 public feeBps;
    /// @notice high-water mark of assets per WAD of shares (0 until the first deposit)
    uint256 public hwmPricePerShare;

    event FeeAccrued(uint256 feeAssets, uint256 feeShares);
    event FeeSet(uint256 feeBps);
    event FeeRecipientSet(address feeRecipient);

    constructor(
        IERC20 asset_,
        IERC4626 underlying_,
        uint256 feeBps_,
        address owner_
    ) ERC4626(asset_) ERC20("mochi USD", "mUSD") Ownable(owner_) {
        require(underlying_.asset() == address(asset_), "underlying asset mismatch");
        require(feeBps_ <= MAX_FEE_BPS, "fee too high");
        underlying = underlying_;
        feeBps = feeBps_;
    }

    /// @notice wire the staking contract, exactly once. until then the fee is off.
    function setFeeRecipient(address recipient) external onlyOwner {
        require(feeRecipient == address(0), "already set");
        require(recipient != address(0), "recipient zero");
        _accrueFee(); // ratchet the mark so pre-wiring yield is never charged retroactively
        feeRecipient = recipient;
        emit FeeRecipientSet(recipient);
    }

    /* ---------------- accounting ---------------- */

    /// @dev USDG has 6 decimals; a +12 offset gives 18-decimal shares and strong
    ///      first-depositor (inflation attack) protection.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 12;
    }

    /// @notice idle USDG plus the redeemable value of our underlying position
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this))
            + underlying.previewRedeem(underlying.balanceOf(address(this)));
    }

    /// @dev assets per WAD of shares, flow-invariant (uses the same virtual-share basis as OZ)
    function _pricePerShare() internal view returns (uint256) {
        return (totalAssets() + 1).mulDiv(WAD, totalSupply() + 10 ** _decimalsOffset(), Math.Rounding.Floor);
    }

    /// @dev mint fee shares against yield above the high-water price; losses and recovery
    ///      back to the old high are never charged
    function _accrueFee() internal {
        uint256 supply = totalSupply();
        if (supply == 0) return;
        uint256 pps = _pricePerShare();
        uint256 hwm = hwmPricePerShare;
        if (hwm != 0 && pps > hwm && feeBps > 0 && feeRecipient != address(0)) {
            uint256 yieldAssets = (pps - hwm).mulDiv(supply, WAD, Math.Rounding.Floor);
            uint256 feeAssets = yieldAssets * feeBps / BPS;
            if (feeAssets > 0) {
                uint256 total = totalAssets();
                // shares such that feeRecipient can redeem exactly feeAssets afterwards
                uint256 feeShares =
                    feeAssets.mulDiv(supply + 10 ** _decimalsOffset(), total - feeAssets + 1, Math.Rounding.Floor);
                if (feeShares > 0) {
                    _mint(feeRecipient, feeShares);
                    emit FeeAccrued(feeAssets, feeShares);
                }
            }
        }
        _updateHwm();
    }

    /// @dev ratchet the mark upward only; reset when the vault empties
    function _updateHwm() internal {
        if (totalSupply() == 0) {
            hwmPricePerShare = 0;
            return;
        }
        uint256 pps = _pricePerShare();
        if (pps > hwmPricePerShare || hwmPricePerShare == 0) {
            hwmPricePerShare = pps;
        }
    }

    /* ---------------- flows ---------------- */

    function deposit(uint256 assets, address receiver) public override returns (uint256 shares) {
        _accrueFee();
        shares = super.deposit(assets, receiver);
        _updateHwm();
    }

    function mint(uint256 shares, address receiver) public override returns (uint256 assets) {
        _accrueFee();
        assets = super.mint(shares, receiver);
        _updateHwm();
    }

    function withdraw(uint256 assets, address receiver, address owner_) public override returns (uint256 shares) {
        _accrueFee();
        shares = super.withdraw(assets, receiver, owner_);
        _updateHwm();
    }

    function redeem(uint256 shares, address receiver, address owner_) public override returns (uint256 assets) {
        _accrueFee();
        assets = super.redeem(shares, receiver, owner_);
        _updateHwm();
    }

    /// @dev after taking the deposit, push everything idle into the underlying vault
    ///      (up to its cap; anything above the cap stays idle and is picked up later)
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        super._deposit(caller, receiver, assets, shares);
        _pushToUnderlying();
    }

    /// @dev before paying out, pull what idle cannot cover from the underlying vault
    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
    {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (assets > idle) {
            underlying.withdraw(assets - idle, address(this), address(this));
        }
        super._withdraw(caller, receiver, owner_, assets, shares);
    }

    function _pushToUnderlying() internal {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 cap = underlying.maxDeposit(address(this));
        uint256 amount = idle < cap ? idle : cap;
        if (amount > 0) {
            IERC20(asset()).forceApprove(address(underlying), amount);
            underlying.deposit(amount, address(this));
        }
    }

    /* ---------------- limits ---------------- */

    /// @notice honest exit limits: what idle plus the underlying will actually pay right now
    function maxWithdraw(address owner_) public view override returns (uint256) {
        uint256 cap = IERC20(asset()).balanceOf(address(this)) + underlying.maxWithdraw(address(this));
        uint256 own = super.maxWithdraw(owner_);
        return own < cap ? own : cap;
    }

    function maxRedeem(address owner_) public view override returns (uint256) {
        uint256 capAssets = IERC20(asset()).balanceOf(address(this)) + underlying.maxWithdraw(address(this));
        // ceil so dust-level rounding never strands the last shares (previewRedeem floors,
        // so redeeming the capped share amount still requests <= capAssets)
        uint256 capShares = _convertToShares(capAssets, Math.Rounding.Ceil);
        uint256 own = super.maxRedeem(owner_);
        return own < capShares ? own : capShares;
    }

    /* ---------------- admin ---------------- */

    /// @notice anyone may realize pending yield into fee shares (e.g. once an epoch)
    function accrue() external {
        _accrueFee();
    }

    function setFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "fee too high");
        _accrueFee(); // settle at the old rate first
        feeBps = newFeeBps;
        emit FeeSet(newFeeBps);
    }
}
