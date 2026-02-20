// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ActivityFactory} from "./ActivityFactory.sol";
import {ActivityPOAP} from "./ActivityPOAP.sol";
import {ActivityComments} from "./ActivityComments.sol";
import {ReviewStaking} from "./ReviewStaking.sol";
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
        comments = new ActivityComments(address(factory), address(0));
        poap = ActivityPOAP(factory.getPOAPContract(ACTIVITY_ID));
        vm.prank(user1);
        poap.mint(user1, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye");
        vm.prank(user1);
        poap.mint(user2, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye");
    }

    function test_Constructor() public view {
        assertEq(address(comments.factory()), address(factory));
        assertEq(comments.reviewGate(), address(0));
    }

    function test_GetCommentCount_Empty() public view {
        assertEq(comments.getCommentCount(ACTIVITY_ID), 0);
    }

    function test_GetCommentCount_NonExistentActivity() public view {
        assertEq(comments.getCommentCount("activity-999"), 0);
    }

    function test_GetComments_Empty() public view {
        ActivityComments.Comment[] memory list = comments.getComments(ACTIVITY_ID);
        assertEq(list.length, 0);
    }

    function test_PostComment() public {
        vm.prank(user1);
        comments.postComment(ACTIVITY_ID, "ipfs://QmComment1");
        assertEq(comments.getCommentCount(ACTIVITY_ID), 1);
        (address commenter, string memory contentURI, string memory reviewURI, bool isVisible, bool inQuestion, uint256 ts, uint256 replyToIndex) = comments.getComment(ACTIVITY_ID, 0);
        assertEq(commenter, user1);
        assertEq(contentURI, "ipfs://QmComment1");
        assertEq(reviewURI, "");
        assertFalse(isVisible);
        assertFalse(inQuestion);
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
        (, , , , , , uint256 replyTo0) = comments.getComment(ACTIVITY_ID, 0);
        (, , , , , , uint256 replyTo1) = comments.getComment(ACTIVITY_ID, 1);
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

    function test_PostReply_ActivityNotFound_Reverts() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(ActivityComments.ActivityNotFound.selector, "activity-999"));
        comments.postReply("activity-999", 0, "ipfs://x", "");
    }

    function test_PostReply_NotPOAPHolder_Reverts() public {
        vm.prank(user1);
        comments.postComment(ACTIVITY_ID, "ipfs://root");
        vm.prank(deployer);
        vm.expectRevert(ActivityComments.NotPOAPHolder.selector);
        comments.postReply(ACTIVITY_ID, 0, "ipfs://x", "");
    }

    function test_SetCommentVisible_NoReviewGate_Reverts() public {
        vm.prank(user1);
        comments.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user1);
        vm.expectRevert(ActivityComments.NoReviewGate.selector);
        comments.setCommentVisible(ACTIVITY_ID, 0, true);
    }

    function test_SetCommentVisible_NotReviewer_Reverts() public {
        ReviewStaking staking = new ReviewStaking(deployer, 100e18);
        ActivityComments commentsWithGate = new ActivityComments(address(factory), address(staking));
        vm.prank(user1);
        commentsWithGate.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user1);
        vm.expectRevert(ActivityComments.NotReviewer.selector);
        commentsWithGate.setCommentVisible(ACTIVITY_ID, 0, true);
    }

    function test_SetCommentVisible_WithReviewGate() public {
        ReviewStaking staking = new ReviewStaking(deployer, 100e18);
        vm.deal(user1, 100e18);
        ActivityComments commentsWithGate = new ActivityComments(address(factory), address(staking));
        vm.prank(user1);
        commentsWithGate.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user1);
        staking.stake{value: 100e18}();
        vm.prank(user1);
        commentsWithGate.setCommentVisible(ACTIVITY_ID, 0, true);
        (, , , bool isVisible, , , ) = commentsWithGate.getComment(ACTIVITY_ID, 0);
        assertTrue(isVisible);
        vm.prank(user1);
        commentsWithGate.setCommentVisible(ACTIVITY_ID, 0, false);
        (, , , isVisible, , , ) = commentsWithGate.getComment(ACTIVITY_ID, 0);
        assertFalse(isVisible);
    }

    function test_SetCommentVisible_CommentIndexOutOfRange_Reverts() public {
        ReviewStaking staking = new ReviewStaking(deployer, 100e18);
        vm.deal(user1, 100e18);
        ActivityComments commentsWithGate = new ActivityComments(address(factory), address(staking));
        vm.prank(user1);
        commentsWithGate.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user1);
        staking.stake{value: 100e18}();
        vm.prank(user1);
        vm.expectRevert(ActivityComments.CommentIndexOutOfRange.selector);
        commentsWithGate.setCommentVisible(ACTIVITY_ID, 1, true);
    }

    function test_SetCommentInQuestion_CommentIndexOutOfRange_Reverts() public {
        ReviewStaking staking = new ReviewStaking(deployer, 100e18);
        vm.deal(user1, 100e18);
        ActivityComments commentsWithGate = new ActivityComments(address(factory), address(staking));
        vm.prank(user1);
        commentsWithGate.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user1);
        staking.stake{value: 100e18}();
        vm.prank(user1);
        vm.expectRevert(ActivityComments.CommentIndexOutOfRange.selector);
        commentsWithGate.setCommentInQuestion(ACTIVITY_ID, 1, true);
    }

    function test_SetCommentInQuestion_NoReviewGate_Reverts() public {
        vm.prank(user1);
        comments.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user1);
        vm.expectRevert(ActivityComments.NoReviewGate.selector);
        comments.setCommentInQuestion(ACTIVITY_ID, 0, true);
    }

    function test_SetCommentInQuestion_WithReviewGate_SetsFlag() public {
        ReviewStaking staking = new ReviewStaking(deployer, 100e18);
        vm.deal(user2, 100e18);
        ActivityComments commentsWithGate = new ActivityComments(address(factory), address(staking));
        // user2 已在 setUp 中 mint 过 POAP
        vm.prank(user2);
        commentsWithGate.postComment(ACTIVITY_ID, "ipfs://x");
        vm.prank(user2);
        staking.stake{value: 100e18}();
        vm.prank(user2);
        commentsWithGate.setCommentInQuestion(ACTIVITY_ID, 0, true);
        (, , , , bool inQuestion, , ) = commentsWithGate.getComment(ACTIVITY_ID, 0);
        assertTrue(inQuestion);
        vm.prank(user2);
        commentsWithGate.setCommentInQuestion(ACTIVITY_ID, 0, false);
        (, , , , inQuestion, , ) = commentsWithGate.getComment(ACTIVITY_ID, 0);
        assertFalse(inQuestion);
    }

    function test_SetCommentInQuestion_CannotSetInQuestionSelf_Reverts() public {
        ReviewStaking staking = new ReviewStaking(deployer, 100e18);
        vm.deal(user1, 100e18);
        ActivityComments commentsWithGate = new ActivityComments(address(factory), address(staking));
        vm.prank(user1);
        commentsWithGate.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user1);
        staking.stake{value: 100e18}();
        vm.prank(user1);
        commentsWithGate.reviewComment(ACTIVITY_ID, 0, "ipfs://review", true);
        vm.prank(user1);
        vm.expectRevert(ActivityComments.CannotSetInQuestionSelf.selector);
        commentsWithGate.setCommentInQuestion(ACTIVITY_ID, 0, true);
    }

    function test_SetCommentInQuestion_OtherReviewerCanSet() public {
        ReviewStaking staking = new ReviewStaking(deployer, 100e18);
        vm.deal(user1, 100e18);
        vm.deal(user2, 100e18);
        ActivityComments commentsWithGate = new ActivityComments(address(factory), address(staking));
        vm.prank(user1);
        commentsWithGate.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user2);
        staking.stake{value: 100e18}();
        vm.prank(user2);
        commentsWithGate.reviewComment(ACTIVITY_ID, 0, "ipfs://review", true);
        vm.prank(user1);
        staking.stake{value: 100e18}();
        vm.prank(user1);
        commentsWithGate.setCommentInQuestion(ACTIVITY_ID, 0, true);
        (, , , , bool inQuestion, , ) = commentsWithGate.getComment(ACTIVITY_ID, 0);
        assertTrue(inQuestion);
    }

    function test_ReviewComment_NoReviewGate_Reverts() public {
        vm.prank(user1);
        comments.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user1);
        vm.expectRevert(ActivityComments.NoReviewGate.selector);
        comments.reviewComment(ACTIVITY_ID, 0, "ipfs://review", true);
    }

    function test_ReviewComment_NotReviewer_Reverts() public {
        ReviewStaking staking = new ReviewStaking(deployer, 100e18);
        ActivityComments commentsWithGate = new ActivityComments(address(factory), address(staking));
        vm.prank(user1);
        commentsWithGate.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user2);
        vm.expectRevert(ActivityComments.NotReviewer.selector);
        commentsWithGate.reviewComment(ACTIVITY_ID, 0, "ipfs://review", true);
    }

    function test_ReviewComment_CommentIndexOutOfRange_Reverts() public {
        ReviewStaking staking = new ReviewStaking(deployer, 100e18);
        vm.deal(user1, 100e18);
        ActivityComments commentsWithGate = new ActivityComments(address(factory), address(staking));
        vm.prank(user1);
        commentsWithGate.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user1);
        staking.stake{value: 100e18}();
        vm.prank(user1);
        vm.expectRevert(ActivityComments.CommentIndexOutOfRange.selector);
        commentsWithGate.reviewComment(ACTIVITY_ID, 1, "ipfs://review", true);
    }

    function test_ReviewComment_SetsReviewAndVisibility() public {
        ReviewStaking staking = new ReviewStaking(deployer, 100e18);
        vm.deal(user2, 100e18);
        ActivityComments commentsWithGate = new ActivityComments(address(factory), address(staking));
        vm.prank(user2);
        commentsWithGate.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user2);
        staking.stake{value: 100e18}();
        vm.warp(2000);
        vm.prank(user2);
        commentsWithGate.reviewComment(ACTIVITY_ID, 0, "ipfs://reviewUri", true);
        ActivityComments.Comment[] memory list = commentsWithGate.getComments(ACTIVITY_ID);
        assertEq(list[0].reviewURI, "ipfs://reviewUri");
        assertTrue(list[0].isVisible);
        assertEq(list[0].reviewer, user2);
        assertEq(list[0].reviewTimestamp, 2000);
    }

    function test_ReviewComment_AlreadyReviewed_Reverts() public {
        ReviewStaking staking = new ReviewStaking(deployer, 100e18);
        vm.deal(user1, 100e18);
        ActivityComments commentsWithGate = new ActivityComments(address(factory), address(staking));
        vm.prank(user1);
        commentsWithGate.postComment(ACTIVITY_ID, "ipfs://c");
        vm.prank(user1);
        staking.stake{value: 100e18}();
        vm.prank(user1);
        commentsWithGate.reviewComment(ACTIVITY_ID, 0, "ipfs://r1", true);
        vm.prank(user1);
        vm.expectRevert(ActivityComments.CommentAlreadyReviewed.selector);
        commentsWithGate.reviewComment(ACTIVITY_ID, 0, "ipfs://r2", false);
    }

    function test_GetComments_ReturnsFullStruct() public {
        vm.prank(user1);
        comments.postComment(ACTIVITY_ID, "ipfs://a");
        vm.prank(user2);
        comments.postReply(ACTIVITY_ID, 0, "ipfs://b", "ipfs://rev");
        ActivityComments.Comment[] memory list = comments.getComments(ACTIVITY_ID);
        assertEq(list.length, 2);
        assertEq(list[0].commenter, user1);
        assertEq(list[0].contentURI, "ipfs://a");
        assertTrue(list[0].commentType == ActivityComments.CommentType.NORMAL);
        assertEq(list[0].replyToIndex, comments.NO_PARENT());
        assertEq(list[1].commenter, user2);
        assertEq(list[1].contentURI, "ipfs://b");
        assertEq(list[1].reviewURI, "ipfs://rev");
        assertTrue(list[1].commentType == ActivityComments.CommentType.REPLY);
        assertEq(list[1].replyToIndex, 0);
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
