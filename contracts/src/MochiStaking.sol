// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MochiStaking (sMOCHI)
/// @notice Stake $MOCHI, earn the vault's performance fee in mUSD (MochiVault shares —
///         redeemable for USDG at any time). Rewards are whatever mUSD lands on this
///         contract; there are no emissions and no lockups.
/// @dev    Index-based distribution. `sync()` folds any newly received mUSD into the
///         reward index; it runs inside every stake/unstake/claim, so no keeper is needed.
///         mUSD received while nobody is staked waits and goes to the first stakers.
contract MochiStaking is Ownable {
    using SafeERC20 for IERC20;

    uint256 private constant PREC = 1e27;

    IERC20 public immutable mochi;
    /// @notice mUSD — set exactly once, right after the vault is deployed
    IERC20 public rewardToken;

    uint256 public totalStaked;
    mapping(address => uint256) public staked;

    uint256 public rewardIndex; // scaled by PREC
    mapping(address => uint256) public userIndex;
    mapping(address => uint256) public accrued;
    /// @notice reward tokens already folded into the index (allocated but possibly unclaimed)
    uint256 public reserved;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 rewards);
    event Synced(uint256 newRewards);

    constructor(IERC20 mochi_, address owner_) Ownable(owner_) {
        require(address(mochi_) != address(0), "mochi zero");
        mochi = mochi_;
    }

    function setRewardToken(IERC20 token) external onlyOwner {
        require(address(rewardToken) == address(0), "already set");
        require(address(token) != address(0) && address(token) != address(mochi), "bad reward token");
        rewardToken = token;
    }

    /* ---------------- distribution ---------------- */

    /// @notice fold newly received mUSD into the reward index; callable by anyone
    function sync() public {
        if (address(rewardToken) == address(0) || totalStaked == 0) return;
        uint256 pending = rewardToken.balanceOf(address(this)) - reserved;
        if (pending > 0) {
            rewardIndex += pending * PREC / totalStaked;
            reserved += pending;
            emit Synced(pending);
        }
    }

    function _settle(address user) internal {
        uint256 idx = rewardIndex;
        accrued[user] += staked[user] * (idx - userIndex[user]) / PREC;
        userIndex[user] = idx;
    }

    /* ---------------- actions ---------------- */

    function stake(uint256 amount) external {
        require(amount > 0, "zero");
        sync();
        _settle(msg.sender);
        mochi.safeTransferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) public {
        require(amount > 0 && amount <= staked[msg.sender], "bad amount");
        sync();
        _settle(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        mochi.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claim() public returns (uint256 rewards) {
        sync();
        _settle(msg.sender);
        rewards = accrued[msg.sender];
        if (rewards > 0) {
            accrued[msg.sender] = 0;
            reserved -= rewards;
            rewardToken.safeTransfer(msg.sender, rewards);
            emit Claimed(msg.sender, rewards);
        }
    }

    function exit() external {
        uint256 amount = staked[msg.sender];
        if (amount > 0) unstake(amount);
        claim();
    }

    /* ---------------- views ---------------- */

    function claimable(address user) external view returns (uint256) {
        uint256 idx = rewardIndex;
        if (address(rewardToken) != address(0) && totalStaked > 0) {
            uint256 pending = rewardToken.balanceOf(address(this)) - reserved;
            idx += pending * PREC / totalStaked;
        }
        return accrued[user] + staked[user] * (idx - userIndex[user]) / PREC;
    }
}
