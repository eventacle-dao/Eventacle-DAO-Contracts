// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./ActivityPOAP.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title ActivityFactory
 * @dev 任何人都可以调用此工厂创建新的活动，并为每个活动部署独立的 POAP 合约。
 *      activityId 由合约自动生成（activity-1, activity-2, ...），并记录链上创建时间。
 *      部署后立即放弃所有权，确保无人能控制工厂或已部署的子合约。
 */
contract ActivityFactory is Ownable {
    // 活动序号，用于自动生成 activityId
    uint256 private _activityCounter;
    
    // 记录所有已创建的活动ID，便于链下索引
    string[] public activityIds;
    
    // 活动ID => 对应的 POAP 合约地址
    mapping(string => address) public getPOAPContract;

    // 活动ID => 活动元数据 URI（活动名称、时间、地点等描述信息）
    mapping(string => string) public getActivityMetadataURI;
    
    // 活动ID => 创建者地址
    mapping(string => address) public getActivityCreator;
    
    // 活动ID => 链上创建时间（Unix 时间戳）
    mapping(string => uint256) public getActivityCreatedAt;
    
    event ActivityCreated(
        string indexed activityId,
        address indexed creator,
        string activityMetadataURI,
        address poapContract,
        string name,
        string symbol,
        uint256 createdAt
    );
    
    constructor() Ownable(msg.sender) {
        // 构造函数中记录部署者为 owner，稍后在部署后立即放弃
    }
    
    /**
     * @dev 创建新活动，activityId 自动生成为 "activity-1"、"activity-2" ...
     *      POAP 的徽章元数据在 mint 时由 minter 传入并绑定。
     * @param name POAP 的名称（例如 "Hackathon 2026 Attendance"）
     * @param symbol POAP 的符号（例如 "H26"）
     * @param activityMetadataURI 活动元数据 URI（活动描述：名称、时间、地点等）
     * @return activityId 自动生成的活动 ID
     * @return poapAddress 新部署的 POAP 合约地址
     */
    function createActivity(
        string memory name,
        string memory symbol,
        string memory activityMetadataURI
    ) external returns (string memory activityId, address poapAddress) {
        _activityCounter++;
        activityId = string.concat("activity-", Strings.toString(_activityCounter));
        
        ActivityPOAP poap = new ActivityPOAP(name, symbol, msg.sender);
        poapAddress = address(poap);
        
        uint256 createdAt = block.timestamp;
        
        activityIds.push(activityId);
        getPOAPContract[activityId] = poapAddress;
        getActivityMetadataURI[activityId] = activityMetadataURI;
        getActivityCreator[activityId] = msg.sender;
        getActivityCreatedAt[activityId] = createdAt;

        emit ActivityCreated(activityId, msg.sender, activityMetadataURI, poapAddress, name, symbol, createdAt);
    }
    
    /**
     * @dev 获取所有活动ID列表（用于前端展示）
     */
    function getAllActivityIds() external view returns (string[] memory) {
        return activityIds;
    }
    
    function getActivityInfo(string memory activityId) external view returns (
        address creator,
        uint256 createdAt,
        address poapAddress,
        string memory activityMetadataURI
    ) {
        creator = getActivityCreator[activityId];
        createdAt = getActivityCreatedAt[activityId];
        poapAddress = getPOAPContract[activityId];
        activityMetadataURI = getActivityMetadataURI[activityId];
    }

    /**
     * @dev 放弃所有权，使工厂彻底去中心化。
     *      此函数必须在部署后由部署者立即调用。
     */
    function renounceOwnership() public override onlyOwner {
        super.renounceOwnership();
    }
}