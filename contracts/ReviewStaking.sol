// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IReviewGate
 * @dev 供评论等合约查询某地址是否具备 review 权限的接口。
 */
interface IReviewGate {
    function hasReviewPermission(address account) external view returns (bool);
}

/**
 * @title ReviewStaking
 * @dev 质押一定量的 INJ（原生代币）即可获得 review 权限。
 *      质押量达到 requiredStake 即视为拥有 review 权限；取回后低于该值则失去权限。
 *      合约仅记录各地址的质押余额，实际 INJ 存于合约中，用户可随时 unstake 取回。
 */
contract ReviewStaking is IReviewGate, Ownable, ReentrancyGuard {
    /// 获得 review 权限所需的最低质押量（wei，18 位小数）
    uint256 public requiredStake;

    /// 各地址的质押余额
    mapping(address => uint256) public stakedAmount;

    /// 合约内 INJ 总质押量（与各 stakedAmount 之和一致，便于校验）
    uint256 public totalStaked;

    event Staked(address indexed account, uint256 amount);
    event Unstaked(address indexed account, uint256 amount);
    event RequiredStakeUpdated(uint256 oldValue, uint256 newValue);

    error InsufficientStake(uint256 sent, uint256 required);
    error InsufficientBalance(uint256 requested, uint256 available);
    error UnstakeWouldFail();

    constructor(address initialOwner, uint256 _requiredStake) Ownable(initialOwner) {
        requiredStake = _requiredStake;
        emit RequiredStakeUpdated(0, _requiredStake);
    }

    /**
     * @dev 质押 INJ。发送的 msg.value 会累加到调用者的质押余额。
     */
    function stake() external payable nonReentrant {
        if (msg.value == 0) {
            revert InsufficientStake(0, 1);
        }
        stakedAmount[msg.sender] += msg.value;
        totalStaked += msg.value;
        emit Staked(msg.sender, msg.value);
    }

    /**
     * @dev 取回质押。取回后若余额低于 requiredStake 将失去 review 权限。
     * @param amount 要取回的 INJ 数量（wei）
     */
    function unstake(uint256 amount) external nonReentrant {
        uint256 balance = stakedAmount[msg.sender];
        if (amount > balance) {
            revert InsufficientBalance(amount, balance);
        }
        stakedAmount[msg.sender] -= amount;
        totalStaked -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) {
            revert UnstakeWouldFail();
        }
        emit Unstaked(msg.sender, amount);
    }

    /**
     * @dev 查询某地址是否具有 review 权限（质押量 >= requiredStake）。
     */
    function hasReviewPermission(address account) external view override returns (bool) {
        return stakedAmount[account] >= requiredStake;
    }

    /**
     * @dev 管理员更新获得 review 权限所需的最低质押量。
     */
    function setRequiredStake(uint256 _requiredStake) external onlyOwner {
        uint256 oldValue = requiredStake;
        requiredStake = _requiredStake;
        emit RequiredStakeUpdated(oldValue, _requiredStake);
    }

    /// 直接向合约地址转账的 INJ 也会计入发送者的质押余额（与调用 stake() 效果一致）
    receive() external payable nonReentrant {
        if (msg.value == 0) return;
        stakedAmount[msg.sender] += msg.value;
        totalStaked += msg.value;
        emit Staked(msg.sender, msg.value);
    }
}
