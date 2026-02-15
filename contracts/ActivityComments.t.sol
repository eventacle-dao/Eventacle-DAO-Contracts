// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ActivityFactory} from "./ActivityFactory.sol";
import {ActivityPOAP} from "./ActivityPOAP.sol";
import {ActivityComments} from "./ActivityComments.sol";
import {Test} from "forge-std/Test.sol";

contract ActivityCommentsTest is Test {
    ActivityFactory factory;
    ActivityComments comments;
    ActivityPOAP poap;
    address deployer;
    address user1;
    address user2;
    string constant ACTIVITY_ID = "activity-1";

    function setUp() public {
        deployer = makeAddr("deployer");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        vm.prank(deployer);
        factory = new ActivityFactory();
        vm.prank(user1);
        factory.createActivity("Test Activity", "TA", "https://ipfs.io/ipfs/QmHash");
        comments = new ActivityComments(address(factory));
        poap = ActivityPOAP(factory.getPOAPContract(ACTIVITY_ID));
        vm.prank(user1);
        poap.mint(user1);
        vm.prank(user1);
        poap.mint(user2);
    }

    function test_Constructor() public view {
        assertEq(address(comments.factory()), address(factory));
    }

    function test_PostComment() public {
        vm.prank(user1);
        comments.postComment(ACTIVITY_ID, "ipfs://QmComment1");
        assertEq(comments.getCommentCount(ACTIVITY_ID), 1);
        (address commenter, string memory contentURI, string memory reviewURI, bool isVisible, uint256 ts, uint256 replyToIndex) = comments.getComment(ACTIVITY_ID, 0);
        assertEq(commenter, user1);
        assertEq(contentURI, "ipfs://QmComment1");
        assertEq(reviewURI, "");
        assertFalse(isVisible);  // 普通评论当前为不展示，由前端/业务决定
        assertEq(ts, block.timestamp);
        assertEq(replyToIndex, comments.NO_PARENT());
    }

    function test_PostComment_Multiple() public {
        vm.prank(user1);
        comments.postComment(ACTIVITY_ID, "ipfs://QmComment1");
        vm.prank(user2);
        comments.postComment(ACTIVITY_ID, "ipfs://QmComment2");
        vm.prank(user1);
        comments.postComment(ACTIVITY_ID, "ipfs://QmComment3");
        assertEq(comments.getCommentCount(ACTIVITY_ID), 3);
        ActivityComments.Comment[] memory list = comments.getComments(ACTIVITY_ID);
        assertEq(list.length, 3);
        assertEq(list[0].contentURI, "ipfs://QmComment1");
        assertEq(list[0].reviewURI, "");
        assertEq(list[1].contentURI, "ipfs://QmComment2");
        assertEq(list[2].contentURI, "ipfs://QmComment3");
    }

    function test_PostComment_ActivityNotFound_Reverts() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(ActivityComments.ActivityNotFound.selector, "activity-999"));
        comments.postComment("activity-999", "ipfs://QmX");
    }

    function test_PostComment_NotPOAPHolder_Reverts() public {
        vm.prank(deployer);
        vm.expectRevert(ActivityComments.NotPOAPHolder.selector);
        comments.postComment(ACTIVITY_ID, "ipfs://QmX");
    }

    function test_GetComment_OutOfRange_Reverts() public {
        vm.expectRevert("Comment index out of range");
        comments.getComment(ACTIVITY_ID, 0);
    }

    function test_CommentPosted_Event() public {
        vm.prank(user1);
        vm.expectEmit(true, true, true, false);
        emit CommentPosted(ACTIVITY_ID, user1, 0, "", "", false, 0, 0);
        comments.postComment(ACTIVITY_ID, "ipfs://QmComment1");
    }

    function test_PostReply() public {
        vm.prank(user1);
        comments.postComment(ACTIVITY_ID, "ipfs://root");
        vm.prank(user2);
        comments.postReply(ACTIVITY_ID, 0, "ipfs://reply1", "ipfs://review1");
        assertEq(comments.getCommentCount(ACTIVITY_ID), 2);
        (, , , , , uint256 replyTo0) = comments.getComment(ACTIVITY_ID, 0);
        (, , , , , uint256 replyTo1) = comments.getComment(ACTIVITY_ID, 1);
        assertEq(replyTo0, comments.NO_PARENT());
        assertEq(replyTo1, 0);
        ActivityComments.Comment[] memory list = comments.getComments(ACTIVITY_ID);
        assertTrue(list[1].commentType == ActivityComments.CommentType.REPLY);
        assertEq(list[1].replyToIndex, 0);
    }

    function test_PostReply_InvalidReplyToIndex_Reverts() public {
        vm.prank(user1);
        comments.postComment(ACTIVITY_ID, "ipfs://root");
        vm.prank(user2);
        vm.expectRevert(abi.encodeWithSelector(ActivityComments.InvalidReplyToIndex.selector, 5, 1));
        comments.postReply(ACTIVITY_ID, 5, "ipfs://x", "");
    }

    event CommentPosted(
        string indexed activityId,
        address indexed commenter,
        uint256 indexed commentIndex,
        string contentURI,
        string reviewURI,
        bool isVisible,
        uint256 timestamp,
        uint256 replyToIndex
    );
}
