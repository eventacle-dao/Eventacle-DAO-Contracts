// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./ActivityPOAP.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title ActivityFactory
 * @dev 任何人都可以调用此工厂创建新的活动，并为每个活动部署独立的 POAP 合约。
 *      activityId 由合约自动生成（activity-1, activity-2, ...），并记录链上创建时间。
 *      activityIds 按活动开始时间 startAt 升序排列，便于按时间线展示与分页。
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

    // 活动ID => 活动时间（Unix 时间戳）
    mapping(string => uint256) public getActivityStartAt;
    mapping(string => uint256) public getActivityEndAt;

    // 活动ID => 活动类型
    enum ActivityType {
        MEETUP,
        HACKATHON,
        CONFERENCE,
        OTHER
    }
    mapping(string => ActivityType) public getActivityType;

    /// @dev 下次调用「进行中活动」分页时的起始下标（第一个进行中活动），每次 getOngoingActivityIdsPaginated 后更新
    uint256 public nextOngoingScanOffset;

    /// @dev 扫描时若「第一个进行中」与起点相距超过此值，则触发 nextOngoingScanOffset 更新（与 getOngoingActivityIdsPaginated 一致）
    uint256 public constant ONGOING_SCAN_GAP_THRESHOLD = 50;

    event NextOngoingScanOffsetUpdated(uint256 indexed previousOffset, uint256 indexed newOffset);

    event ActivityCreated(
        string indexed activityId,
        address indexed creator,
        string activityMetadataURI,
        address poapContract,
        string name,
        string symbol,
        uint256 createdAt,
        uint256 startAt,
        uint256 endAt,
        ActivityType activityType
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
        string memory activityMetadataURI,
        uint256 startAt,
        uint256 endAt,
        ActivityType activityType
    ) external returns (string memory activityId, address poapAddress) {
        _activityCounter++;
        activityId = string.concat("activity-", Strings.toString(_activityCounter));

        ActivityPOAP poap = new ActivityPOAP(name, symbol, msg.sender);
        poapAddress = address(poap);

        uint256 createdAt = block.timestamp;
        getActivityStartAt[activityId] = startAt;
        getActivityEndAt[activityId] = endAt;
        getActivityType[activityId] = activityType;
        activityIds.push(activityId);
        _insertSortByStartAt(activityIds.length - 1);
        getPOAPContract[activityId] = poapAddress;
        getActivityMetadataURI[activityId] = activityMetadataURI;
        getActivityCreator[activityId] = msg.sender;
        getActivityCreatedAt[activityId] = createdAt;

        emit ActivityCreated(activityId, msg.sender, activityMetadataURI, poapAddress, name, symbol, createdAt, startAt, endAt, activityType);
    }

    /**
     * @dev 将 activityIds[index] 按 startAt 升序插入到正确位置（插入排序的一步）
     */
    function _insertSortByStartAt(uint256 index) private {
        while (index > 0 && getActivityStartAt[activityIds[index]] < getActivityStartAt[activityIds[index - 1]]) {
            string memory prev = activityIds[index - 1];
            activityIds[index - 1] = activityIds[index];
            activityIds[index] = prev;
            index--;
        }
    }
    
    /**
     * @dev 获取所有活动ID列表（按开始时间 startAt 升序）
     */
    function getAllActivityIds() external view returns (string[] memory) {
        return activityIds;
    }

    function getActivityRunningTime(string memory activityId) external view returns (uint256) {
        return getActivityEndAt[activityId] - getActivityStartAt[activityId];
    }

    /**
     * @dev 批量获取活动时间范围（便于链下一次取回后按 block.timestamp 过滤「进行中」）
     * @param ids 活动 ID 列表（如 getAllActivityIds() 的返回值）
     * @return startAts 对应 startAt
     * @return endAts 对应 endAt
     */
    function getActivityTimeRangesBatch(string[] calldata ids) external view returns (
        uint256[] memory startAts,
        uint256[] memory endAts
    ) {
        uint256 n = ids.length;
        startAts = new uint256[](n);
        endAts = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            startAts[i] = getActivityStartAt[ids[i]];
            endAts[i] = getActivityEndAt[ids[i]];
        }
    }

    /**
     * @dev 分页获取当前正在进行的活动 ID。offset 为 0 时使用 nextOngoingScanOffset 作为起始；offset > 0 时分页续查。
     *      本次扫描结束后：若「本页第一个进行中」与本次扫描起点相距超过 ONGOING_SCAN_GAP_THRESHOLD，则更新 nextOngoingScanOffset，
     *      下次 offset=0 的调用将从该位置开始，避免重复扫过多已结束活动。
     * @param offset 0 表示从合约记录的起点开始；非 0 表示从该下标继续（分页）
     * @param limit 最多返回多少个进行中的 id
     * @return ids 本页内「进行中」的 activityId 列表
     * @return nextOffset 本页扫描结束位置（用于继续分页）
     * @return firstOngoingIndex 本页中第一个进行中活动的下标
     * @return needUpdateOffset 本次是否因间隔 > ONGOING_SCAN_GAP_THRESHOLD 需要更新 nextOngoingScanOffset
     */
    function getOngoingActivityIdsPaginated(uint256 offset, uint256 limit) view external returns (
        string[] memory ids,
        uint256 nextOffset,
        uint256 firstOngoingIndex,
        bool needUpdateOffset
    ) {
        needUpdateOffset = false;
        uint256 total = activityIds.length;
        uint256 actualOffset = (offset == 0) ? nextOngoingScanOffset : offset;
        if (actualOffset >= total) {
            return (new string[](0), total, total, needUpdateOffset);
        }
        uint256 t = block.timestamp;
        string[] memory tmp = new string[](limit);
        uint256 countj = 0;
        uint256 firstOngoing = total;
        for (uint256 j = actualOffset; j > 0 && countj < 10; j--) {
            string memory id = activityIds[j];
            if (getActivityEndAt[id] < t) {
                return (new string[](0), j, j, true);
            }
            countj++;
        }
        uint256 count = 0;
        uint256 i = actualOffset;
        for (; i < total && count < limit; i++) {
            string memory id = activityIds[i];
            uint256 startAt = getActivityStartAt[id];
            if (startAt > t) {
                break;
            }
            if (t <= getActivityEndAt[id]) {
                if (count == 0) {
                    firstOngoing = i;
                }
                tmp[count++] = id;
            }
        }
        ids = new string[](count);
        for (uint256 j = 0; j < count; j++) {
            ids[j] = tmp[j];
        }
        if (firstOngoing < total && firstOngoing - actualOffset > ONGOING_SCAN_GAP_THRESHOLD) {
            needUpdateOffset = true;
        }
        return (ids, i, firstOngoing, needUpdateOffset);
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
     * @dev 从 startOffset-10 位置开始正序检查 10 个活动是否有「进行中」的；若有，则找全局第一个进行中 F。
     *      仅当 F 与起点相距 > ONGOING_SCAN_GAP_THRESHOLD 时更新 nextOngoingScanOffset = F（与 getOngoingActivityIdsPaginated 一致，统一「不更新」决定）。
     * @return updated 是否触发了更新
     * @return firstOngoingIndex 第一个进行中活动的下标（未找到或未更新时为 total）
     */
    function scanAndUpdateOngoingOffsetIfNeeded() external returns (bool updated, uint256 firstOngoingIndex) {
        uint256 total = activityIds.length;
        if (total == 0) {
            return (false, total);
        }
        uint256 t = block.timestamp;
        uint256 startOffset = nextOngoingScanOffset;
        if (startOffset >= total) {
            uint256 newOffset = total > 5 ? total - 5 : 0;
            nextOngoingScanOffset = newOffset;
            emit NextOngoingScanOffsetUpdated(startOffset, newOffset);
            return (true, newOffset);
        }
        uint256 count = 0;
        uint256 startIndex = startOffset >= 10 ? startOffset - 10 : 0;
        for (uint256 i = startIndex; i < total && count < 10; i++) {
            string memory id = activityIds[i];
            uint256 startAt = getActivityStartAt[id];
            uint256 endAt = getActivityEndAt[id];
            if (startAt <= t && t <= endAt) {
                uint256 newOffset = startOffset > 10 + ONGOING_SCAN_GAP_THRESHOLD
                    ? startOffset - (10 + ONGOING_SCAN_GAP_THRESHOLD)
                    : 0;
                nextOngoingScanOffset = newOffset;
                emit NextOngoingScanOffsetUpdated(startOffset, newOffset);
                return (true, newOffset);
            }
            count++;
        }
        firstOngoingIndex = total;
        for (uint256 i = startOffset; i < total; i++) {
            string memory id = activityIds[i];
            uint256 startAt = getActivityStartAt[id];
            uint256 endAt = getActivityEndAt[id];
            if (startAt <= t && t <= endAt) {
                firstOngoingIndex = i;
                break;
            }
        }
        if (firstOngoingIndex >= total) {
            uint256 newOffset = total > 5 ? total - 5 : 0;
            nextOngoingScanOffset = newOffset;
            emit NextOngoingScanOffsetUpdated(startOffset, newOffset);
            return (true, newOffset);
        }
        if (firstOngoingIndex - startOffset > ONGOING_SCAN_GAP_THRESHOLD) {
            nextOngoingScanOffset = firstOngoingIndex;
            emit NextOngoingScanOffsetUpdated(startOffset, firstOngoingIndex);
            return (true, firstOngoingIndex);
        }
        return (false, firstOngoingIndex);
    }

    /**
     * @dev 放弃所有权，使工厂彻底去中心化。
     *      此函数必须在部署后由部署者立即调用。
     */
    function renounceOwnership() public override onlyOwner {
        super.renounceOwnership();
    }
}