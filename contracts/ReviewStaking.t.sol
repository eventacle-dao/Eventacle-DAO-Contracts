// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReviewStaking} from "./ReviewStaking.sol";
import {Test} from "forge-std/Test.sol";

contract ReviewStakingTest is Test {
    ReviewStaking staking;
    address owner;
    address user1;
    address user2;
    uint256 constant REQUIRED_STAKE = 100e18;

    function setUp() public {
        owner = makeAddr("owner");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        vm.prank(owner);
        staking = new ReviewStaking(owner, REQUIRED_STAKE);
        vm.deal(user1, 1000e18);
        vm.deal(user2, 1000e18);
    }

    function test_Constructor() public view {
        assertEq(staking.requiredStake(), REQUIRED_STAKE);
        assertEq(staking.owner(), owner);
        assertEq(staking.totalStaked(), 0);
    }

    function test_Stake_IncreasesBalanceAndTotalStaked() public {
        vm.prank(user1);
        staking.stake{value: 50e18}();
        assertEq(staking.stakedAmount(user1), 50e18);
        assertEq(staking.totalStaked(), 50e18);
        assertFalse(staking.hasReviewPermission(user1));

        vm.prank(user1);
        staking.stake{value: 50e18}();
        assertEq(staking.stakedAmount(user1), REQUIRED_STAKE);
        assertEq(staking.totalStaked(), REQUIRED_STAKE);
        assertTrue(staking.hasReviewPermission(user1));
    }

    function test_Stake_ZeroReverts() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(ReviewStaking.InsufficientStake.selector, 0, 1));
        staking.stake{value: 0}();
    }

    function test_Unstake_DecreasesBalanceAndRevokesPermission() public {
        vm.prank(user1);
        staking.stake{value: REQUIRED_STAKE}();
        assertTrue(staking.hasReviewPermission(user1));

        uint256 user1Before = user1.balance;
        vm.prank(user1);
        staking.unstake(50e18);
        assertEq(staking.stakedAmount(user1), 50e18);
        assertEq(staking.totalStaked(), 50e18);
        assertFalse(staking.hasReviewPermission(user1));
        assertEq(user1.balance - user1Before, 50e18);
    }

    function test_Unstake_ExcessReverts() public {
        vm.prank(user1);
        staking.stake{value: 10e18}();
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(ReviewStaking.InsufficientBalance.selector, 20e18, 10e18));
        staking.unstake(20e18);
    }

    function test_HasReviewPermission() public {
        assertFalse(staking.hasReviewPermission(user1));
        vm.prank(user1);
        staking.stake{value: REQUIRED_STAKE}();
        assertTrue(staking.hasReviewPermission(user1));
    }

    function test_SetRequiredStake_OnlyOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        staking.setRequiredStake(200e18);

        vm.prank(owner);
        staking.setRequiredStake(200e18);
        assertEq(staking.requiredStake(), 200e18);
    }

    function test_Receive_CreditsSender() public {
        vm.deal(address(this), 100e18);
        (bool ok,) = address(staking).call{value: 50e18}("");
        assertTrue(ok);
        // receive 时 msg.sender 为当前合约（测试合约）
        assertEq(staking.stakedAmount(address(this)), 50e18);
        assertEq(staking.totalStaked(), 50e18);
    }

    receive() external payable {}
}
