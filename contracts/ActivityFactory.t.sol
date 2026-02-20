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
            "https://ipfs.io/ipfs/QmHash123"
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
        (string memory id1,) = factory.createActivity("Event 1", "E1", "https://ipfs.io/ipfs/QmHash123");
        vm.prank(bob);
        (string memory id2,) = factory.createActivity("Event 2", "E2", "https://ipfs.io/ipfs/QmHash123");
        assertEq(id1, "activity-1");
        assertEq(id2, "activity-2");
    }

    function test_GetAllActivityIds() public {
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        vm.prank(alice);
        factory.createActivity("Activity A", "AA", "https://ipfs.io/ipfs/QmHash123");
        vm.prank(bob);
        factory.createActivity("Activity B", "AB", "https://ipfs.io/ipfs/QmHash123");
        string[] memory ids = factory.getAllActivityIds();
        assertEq(ids.length, 2);
        assertEq(ids[0], "activity-1");
        assertEq(ids[1], "activity-2");
    }

    function test_GetActivityCreatedAt() public {
        user1 = makeAddr("user1");
        vm.warp(1000);
        vm.prank(user1);
        factory.createActivity("Test", "T", "https://ipfs.io/ipfs/QmHash123");
        assertEq(factory.getActivityCreatedAt("activity-1"), 1000);
    }

    function test_GetActivityInfo_ReturnsCorrectValues() public {
        user1 = makeAddr("user1");
        vm.warp(12345);
        vm.prank(user1);
        (string memory activityId, address poapAddress) = factory.createActivity(
            "Hackathon 2026",
            "H26",
            "https://ipfs.io/ipfs/QmMeta456"
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
        (, address poap1) = factory.createActivity("A", "A", "ipfs://QmA");
        vm.warp(200);
        vm.prank(bob);
        (, address poap2) = factory.createActivity("B", "B", "ipfs://QmB");

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
}
