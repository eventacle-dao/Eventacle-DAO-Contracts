// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ActivityFactory} from "./ActivityFactory.sol";
import {ActivityPOAP} from "./ActivityPOAP.sol";
import {Test} from "forge-std/Test.sol";

contract ActivityFactoryTest is Test {
    ActivityFactory factory;
    address deployer;
    address user1;

    function setUp() public {
        deployer = makeAddr("deployer");
        vm.prank(deployer);
        factory = new ActivityFactory();
    }

    function test_Constructor() public view {
        assertEq(factory.owner(), deployer);
    }

    function test_CreateActivity() public {
        user1 = makeAddr("user1");
        vm.prank(user1);
        (string memory activityId, address poapAddress) = factory.createActivity(
            "Hackathon 2026 Attendance",
            "H26",
            "https://ipfs.io/ipfs/QmHash123",
            0,
            type(uint256).max,
            ActivityFactory.ActivityType.OTHER
        );
        assertEq(activityId, "activity-1");
        assertNotEq(poapAddress, address(0));
        assertEq(factory.getPOAPContract("activity-1"), poapAddress);
        assertEq(factory.getActivityCreator("activity-1"), user1);
        assertGt(factory.getActivityCreatedAt("activity-1"), 0);
        assertEq(factory.activityIds(0), "activity-1");
        assertEq(factory.getAllActivityIds().length, 1);
        assertEq(factory.getActivityMetadataURI("activity-1"), "https://ipfs.io/ipfs/QmHash123");

        ActivityPOAP poap = ActivityPOAP(poapAddress);
        assertEq(poap.creator(), user1);
        assertEq(poap.name(), "Hackathon 2026 Attendance");
        assertEq(poap.symbol(), "H26");
    }

    function test_CreateActivity_AutoIncrementId() public {
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        vm.prank(alice);
        (string memory id1,) = factory.createActivity("Event 1", "E1", "https://ipfs.io/ipfs/QmHash123", 0, type(uint256).max, ActivityFactory.ActivityType.OTHER);
        vm.prank(bob);
        (string memory id2,) = factory.createActivity("Event 2", "E2", "https://ipfs.io/ipfs/QmHash123", 0, type(uint256).max, ActivityFactory.ActivityType.OTHER);
        assertEq(id1, "activity-1");
        assertEq(id2, "activity-2");
    }

    function test_GetAllActivityIds() public {
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        vm.prank(alice);
        factory.createActivity("Activity A", "AA", "https://ipfs.io/ipfs/QmHash123", 0, type(uint256).max, ActivityFactory.ActivityType.OTHER);
        vm.prank(bob);
        factory.createActivity("Activity B", "AB", "https://ipfs.io/ipfs/QmHash123", 0, type(uint256).max, ActivityFactory.ActivityType.OTHER);
        string[] memory ids = factory.getAllActivityIds();
        assertEq(ids.length, 2);
        assertEq(ids[0], "activity-1");
        assertEq(ids[1], "activity-2");
    }

    function test_GetActivityCreatedAt() public {
        user1 = makeAddr("user1");
        vm.warp(1000);
        vm.prank(user1);
        factory.createActivity("Test", "T", "https://ipfs.io/ipfs/QmHash123", 0, type(uint256).max, ActivityFactory.ActivityType.OTHER);
        assertEq(factory.getActivityCreatedAt("activity-1"), 1000);
    }

    function test_GetActivityInfo_ReturnsCorrectValues() public {
        user1 = makeAddr("user1");
        vm.warp(12345);
        vm.prank(user1);
        (string memory activityId, address poapAddress) = factory.createActivity(
            "Hackathon 2026",
            "H26",
            "https://ipfs.io/ipfs/QmMeta456",
            0,
            type(uint256).max,
            ActivityFactory.ActivityType.OTHER
        );
        (
            address creator,
            uint256 createdAt,
            address poapFromInfo,
            string memory activityMetadataURI
        ) = factory.getActivityInfo(activityId);
        assertEq(creator, user1);
        assertEq(createdAt, 12345);
        assertEq(poapFromInfo, poapAddress);
        assertEq(activityMetadataURI, "https://ipfs.io/ipfs/QmMeta456");
    }

    function test_GetActivityInfo_NonExistentActivity_ReturnsZerosAndEmpty() public view {
        (
            address creator,
            uint256 createdAt,
            address poapAddress,
            string memory activityMetadataURI
        ) = factory.getActivityInfo("activity-999");
        assertEq(creator, address(0));
        assertEq(createdAt, 0);
        assertEq(poapAddress, address(0));
        assertEq(activityMetadataURI, "");
    }

    function test_GetActivityInfo_MultipleActivities() public {
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        vm.warp(100);
        vm.prank(alice);
        (, address poap1) = factory.createActivity("A", "A", "ipfs://QmA", 0, type(uint256).max, ActivityFactory.ActivityType.OTHER);
        vm.warp(200);
        vm.prank(bob);
        (, address poap2) = factory.createActivity("B", "B", "ipfs://QmB", 0, type(uint256).max, ActivityFactory.ActivityType.OTHER);

        (address c1,, address p1, string memory u1) = factory.getActivityInfo("activity-1");
        assertEq(c1, alice);
        assertEq(p1, poap1);
        assertEq(u1, "ipfs://QmA");

        (address c2, uint256 t2, address p2, string memory u2) = factory.getActivityInfo("activity-2");
        assertEq(c2, bob);
        assertEq(t2, 200);
        assertEq(p2, poap2);
        assertEq(u2, "ipfs://QmB");
    }

    function test_RenounceOwnership() public {
        vm.prank(deployer);
        factory.renounceOwnership();
        assertEq(factory.owner(), address(0));
    }

    function test_RenounceOwnership_OnlyOwner_Reverts() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert();
        factory.renounceOwnership();
    }

    function test_GetActivityTimeRangesBatch() public {
        user1 = makeAddr("user1");
        vm.warp(100);
        vm.prank(user1);
        factory.createActivity("A", "A", "ipfs://QmA", 50, 200, ActivityFactory.ActivityType.MEETUP);
        vm.warp(150);
        vm.prank(user1);
        factory.createActivity("B", "B", "ipfs://QmB", 120, 180, ActivityFactory.ActivityType.HACKATHON);
        string[] memory ids = new string[](2);
        ids[0] = "activity-1";
        ids[1] = "activity-2";
        (uint256[] memory startAts, uint256[] memory endAts) = factory.getActivityTimeRangesBatch(ids);
        assertEq(startAts.length, 2);
        assertEq(endAts.length, 2);
        assertEq(startAts[0], 50);
        assertEq(endAts[0], 200);
        assertEq(startAts[1], 120);
        assertEq(endAts[1], 180);
    }

    function test_GetOngoingActivityIdsPaginated() public {
        user1 = makeAddr("user1");
        address alice = makeAddr("alice");
        vm.warp(100);
        vm.prank(user1);
        factory.createActivity("A", "A", "ipfs://QmA", 0, 150, ActivityFactory.ActivityType.OTHER);   // 0–150, ongoing at 100
        vm.prank(alice);
        factory.createActivity("B", "B", "ipfs://QmB", 200, 300, ActivityFactory.ActivityType.OTHER); // not ongoing
        vm.prank(user1);
        factory.createActivity("C", "C", "ipfs://QmC", 50, 120, ActivityFactory.ActivityType.OTHER);   // 50–120, ongoing at 100
        (string[] memory ongoing, uint256 nextOffset, uint256 firstOngoingIndex, bool needUpdateOffset) = factory.getOngoingActivityIdsPaginated(0, 10);
        assertEq(ongoing.length, 2);
        assertEq(ongoing[0], "activity-1");
        assertEq(ongoing[1], "activity-3");
        assertEq(nextOffset, 2);
        assertEq(firstOngoingIndex, 0);
        assertFalse(needUpdateOffset);
        assertEq(factory.nextOngoingScanOffset(), 0);

        (string[] memory ongoing2,,,) = factory.getOngoingActivityIdsPaginated(0, 10);
        assertEq(ongoing2.length, 2);
        assertEq(ongoing2[0], "activity-1");
    }

    function test_ActivityIdsSortedByStartAt() public {
        user1 = makeAddr("user1");
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        vm.prank(user1);
        factory.createActivity("Mid", "M", "ipfs://QmM", 200, 300, ActivityFactory.ActivityType.OTHER);  // start 200 -> activity-1
        vm.prank(alice);
        factory.createActivity("First", "F", "ipfs://QmF", 50, 100, ActivityFactory.ActivityType.OTHER);  // start 50  -> activity-2, sort to first
        vm.prank(bob);
        factory.createActivity("Last", "L", "ipfs://QmL", 500, 600, ActivityFactory.ActivityType.OTHER); // start 500 -> activity-3, sort to last
        string[] memory ids = factory.getAllActivityIds();
        assertEq(ids.length, 3);
        assertEq(ids[0], "activity-2");
        assertEq(ids[1], "activity-1");
        assertEq(ids[2], "activity-3");
        assertEq(factory.getActivityStartAt(ids[0]), 50);
        assertEq(factory.getActivityStartAt(ids[1]), 200);
        assertEq(factory.getActivityStartAt(ids[2]), 500);
    }

    function test_ScanAndUpdateOngoingOffsetIfNeeded_WhenGapOver50_UpdatesOffset() public {
        user1 = makeAddr("user1");
        vm.warp(100);
        vm.prank(user1);
        for (uint256 i = 0; i < 55; i++) {
            factory.createActivity("Past", "P", "ipfs://past", 0, 1, ActivityFactory.ActivityType.OTHER);
        }
        vm.prank(user1);
        factory.createActivity("Ongoing", "O", "ipfs://ongoing", 0, type(uint256).max, ActivityFactory.ActivityType.OTHER);
        assertEq(factory.nextOngoingScanOffset(), 0);

        (bool updated, uint256 firstOngoing) = factory.scanAndUpdateOngoingOffsetIfNeeded();
        assertTrue(updated);
        assertEq(firstOngoing, 55);
        assertEq(factory.nextOngoingScanOffset(), 55); // 统一规则：仅当 gap>50 时更新，且设为第一个进行中下标
    }

    function test_ScanAndUpdateOngoingOffsetIfNeeded_WhenLast10NoOngoing_NoUpdate() public {
        user1 = makeAddr("user1");
        vm.warp(100);
        vm.prank(user1);
        for (uint256 i = 0; i < 20; i++) {
            factory.createActivity("Past", "P", "ipfs://past", 0, 1, ActivityFactory.ActivityType.OTHER);
        }
        vm.prank(user1);
        factory.createActivity("Ongoing", "O", "ipfs://ongoing", 0, type(uint256).max, ActivityFactory.ActivityType.OTHER);
        (bool updated, uint256 firstOngoing) = factory.scanAndUpdateOngoingOffsetIfNeeded();
        assertFalse(updated);
        assertEq(firstOngoing, 20);
        assertEq(factory.nextOngoingScanOffset(), 0);
    }

    // ---------- 最坏情况：getOngoingActivityIdsPaginated ----------

    /// actualOffset >= total：返回空，不越界
    function test_GetOngoingActivityIdsPaginated_WorstCase_OffsetGeTotal_ReturnsEmpty() public {
        user1 = makeAddr("user1");
        vm.warp(100);
        vm.prank(user1);
        factory.createActivity("A", "A", "ipfs://QmA", 0, 200, ActivityFactory.ActivityType.OTHER);
        vm.prank(user1);
        factory.createActivity("B", "B", "ipfs://QmB", 0, 200, ActivityFactory.ActivityType.OTHER);
        vm.prank(user1);
        factory.createActivity("C", "C", "ipfs://QmC", 0, 200, ActivityFactory.ActivityType.OTHER);
        uint256 total = factory.getAllActivityIds().length;
        (string[] memory ids, uint256 nextOffset, uint256 firstOngoingIndex, bool needUpdateOffset) =
            factory.getOngoingActivityIdsPaginated(total, 10);
        assertEq(ids.length, 0);
        assertEq(nextOffset, total);
        assertEq(firstOngoingIndex, total);
        assertFalse(needUpdateOffset);
    }

    /// limit = 0：返回空数组，firstOngoingIndex 未赋值故为 total
    function test_GetOngoingActivityIdsPaginated_WorstCase_LimitZero_ReturnsEmpty() public {
        user1 = makeAddr("user1");
        vm.warp(100);
        vm.prank(user1);
        factory.createActivity("A", "A", "ipfs://QmA", 0, 200, ActivityFactory.ActivityType.OTHER);
        uint256 total = factory.getAllActivityIds().length;
        (string[] memory ids, uint256 nextOffset, uint256 firstOngoingIndex,) =
            factory.getOngoingActivityIdsPaginated(0, 0);
        assertEq(ids.length, 0);
        assertEq(nextOffset, 0);
        assertEq(firstOngoingIndex, total);
    }

    // ---------- 最坏情况：scanAndUpdateOngoingOffsetIfNeeded（仅保留防越界/下溢必要用例）----------

    /// total = 0：不创建活动，直接调用
    function test_ScanAndUpdateOngoingOffsetIfNeeded_WorstCase_TotalZero() public {
        (bool updated, uint256 firstOngoingIndex) = factory.scanAndUpdateOngoingOffsetIfNeeded();
        assertFalse(updated);
        assertEq(firstOngoingIndex, 0);
    }

    /// total < 5 且无进行中：newOffset = 0，无下溢
    function test_ScanAndUpdateOngoingOffsetIfNeeded_WorstCase_TotalLt5_NoOngoing_SetsOffsetZero() public {
        user1 = makeAddr("user1");
        vm.warp(100);
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(user1);
            factory.createActivity("Past", "P", "ipfs://past", 0, 1, ActivityFactory.ActivityType.OTHER);
        }
        (bool updated, uint256 firstOngoingIndex) = factory.scanAndUpdateOngoingOffsetIfNeeded();
        assertTrue(updated);
        assertEq(firstOngoingIndex, 0);
        assertEq(factory.nextOngoingScanOffset(), 0);
    }
}
