// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./ActivityFactory.sol";

/// @dev 仅用于校验调用者是否持有活动 POAP（balanceOf）
interface IERC721Balance {
    function balanceOf(address owner) external view returns (uint256);
}

/**
 * @title ActivityComments
 * @dev 活动评论合约。仅持有该活动 POAP（出席证明）的地址可发表评论或回复。
 *      评论内容存 contentURI（建议 IPFS/Arweave 等），链上仅存 URI 与评论者、时间。
 */
contract ActivityComments {
    ActivityFactory public immutable factory;

    enum CommentType {
        NORMAL,
        REPLY
    }

    /// 无父评论时使用（普通评论）
    uint256 public constant NO_PARENT = type(uint256).max;

    struct Comment {
        address commenter;
        string contentURI;
        string reviewURI;
        bool isVisible;
        uint256 timestamp;
        CommentType commentType;
        uint256 replyToIndex;  // 回复时指向被回复评论的下标；普通评论为 NO_PARENT
    }

    /// activityId 的 keccak256  => 该活动下的评论列表
    mapping(bytes32 => Comment[]) private _commentsByActivity;

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

    error ActivityNotFound(string activityId);
    error InvalidReplyToIndex(uint256 replyToIndex, uint256 currentLength);
    error NotPOAPHolder();  // 仅持有该活动 POAP 的地址可发评论

    function _emitCommentPosted(
        string calldata activityId,
        uint256 commentIndex,
        string memory contentURI,
        string memory reviewURI,
        bool isVisible,
        uint256 replyToIndex_
    ) private {
        emit CommentPosted(activityId, msg.sender, commentIndex, contentURI, reviewURI, isVisible, block.timestamp, replyToIndex_);
    }

    constructor(address _factory) {
        factory = ActivityFactory(payable(_factory));
    }

    /**
     * @dev 对指定活动发表评论。调用者必须持有该活动的 POAP（出席证明）。
     * @param activityId 活动 ID（如 "activity-1"）
     * @param contentURI 评论内容 URI（如 IPFS CID 或 Arweave URL）
     */
    function postComment(string calldata activityId, string calldata contentURI) external {
        address poap = factory.getPOAPContract(activityId);
        if (poap == address(0)) {
            revert ActivityNotFound(activityId);
        }
        if (IERC721Balance(poap).balanceOf(msg.sender) == 0) {
            revert NotPOAPHolder();
        }
        bytes32 key = keccak256(abi.encodePacked(activityId));
        uint256 index = _commentsByActivity[key].length;
        _commentsByActivity[key].push(
            Comment({
                commenter: msg.sender,
                contentURI: contentURI,
                reviewURI: "",
                isVisible: false,
                timestamp: block.timestamp,
                commentType: CommentType.NORMAL,
                replyToIndex: NO_PARENT
            })
        );
        _emitCommentPosted(activityId, index, contentURI, "", false, NO_PARENT);
    }

    /**
     * @param replyToIndex 被回复评论在该活动下的下标（commentIndex）
     */
    function postReply(string calldata activityId, uint256 replyToIndex, string calldata contentURI, string calldata reviewURI) external {
        address poap = factory.getPOAPContract(activityId);
        if (poap == address(0)) {
            revert ActivityNotFound(activityId);
        }
        if (IERC721Balance(poap).balanceOf(msg.sender) == 0) {
            revert NotPOAPHolder();
        }
        bytes32 key = keccak256(abi.encodePacked(activityId));
        Comment[] storage list = _commentsByActivity[key];
        if (replyToIndex >= list.length) {
            revert InvalidReplyToIndex(replyToIndex, list.length);
        }
        list.push(
            Comment({
                commenter: msg.sender,
                contentURI: contentURI,
                reviewURI: reviewURI,
                isVisible: false,
                timestamp: block.timestamp,
                commentType: CommentType.REPLY,
                replyToIndex: replyToIndex
            })
        );
        _emitCommentPosted(activityId, list.length - 1, contentURI, reviewURI, false, replyToIndex);
    }

    /**
     * @dev 获取某活动的评论数量
     */
    function getCommentCount(string calldata activityId) external view returns (uint256) {
        return _commentsByActivity[keccak256(abi.encodePacked(activityId))].length;
    }

    /**
     * @dev 获取某活动的全部评论（评论者、contentURI、时间戳）
     */
    function getComments(string calldata activityId) external view returns (Comment[] memory) {
        Comment[] storage list = _commentsByActivity[keccak256(abi.encodePacked(activityId))];
        Comment[] memory out = new Comment[](list.length);
        for (uint256 i = 0; i < list.length; i++) {
            out[i] = list[i];
        }
        return out;
    }

    /**
     * @dev 获取某活动的单条评论。replyToIndex 为 NO_PARENT 表示普通评论，否则为回复的目标评论下标。
     */
    function getComment(string calldata activityId, uint256 index)
        external
        view
        returns (
            address commenter,
            string memory contentURI,
            string memory reviewURI,
            bool isVisible,
            uint256 timestamp,
            uint256 replyToIndex
        )
    {
        Comment[] storage list = _commentsByActivity[keccak256(abi.encodePacked(activityId))];
        require(index < list.length, "Comment index out of range");
        Comment storage c = list[index];
        return (c.commenter, c.contentURI, c.reviewURI, c.isVisible, c.timestamp, c.replyToIndex);
    }
}
