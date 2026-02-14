// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title ActivityPOAP
 * @dev 每个活动独立的出席证明 NFT（TrustStamp）。
 *      铸造权限由 minter 角色管理，创建者可自由添加/移除 minter，
 *      但 Eventacle 协议无权干预。
 */
contract ActivityPOAP is ERC721 {
    // 活动创建者地址（用于识别，但不具备特殊权限）
    address public immutable creator;
    
    // 授权铸造的地址映射
    mapping(address => bool) public minters;
    
    // 当前 token ID 计数器
    uint256 private _tokenIds;
    
    // 记录每个 tokenId 对应的铸造时间
    mapping(uint256 => uint256) public mintedAt;
    
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event TrustStampMinted(address indexed to, uint256 indexed tokenId);
    
    /**
     * @param name POAP 名称
     * @param symbol POAP 符号
     * @param _creator 活动创建者地址（将被自动授予 minter 权限）
     */
    constructor(
        string memory name,
        string memory symbol,
        address _creator
    ) ERC721(name, symbol) {
        creator = _creator;
        minters[_creator] = true;  // 创建者自动成为第一个 minter
        emit MinterAdded(_creator);
    }
    
    /**
     * @dev 限制调用者必须为 minter
     */
    modifier onlyMinter() {
        require(minters[msg.sender], "Not authorized to mint");
        _;
    }
    
    /**
     * @dev 添加新的 minter（仅限创建者调用）
     * @param minter 要添加的地址
     */
    function addMinter(address minter) external {
        require(msg.sender == creator, "Only creator can add minter");
        require(!minters[minter], "Already minter");
        minters[minter] = true;
        emit MinterAdded(minter);
    }
    
    /**
     * @dev 移除 minter（仅限创建者调用）
     * @param minter 要移除的地址
     */
    function removeMinter(address minter) external {
        require(msg.sender == creator, "Only creator can remove minter");
        require(minters[minter], "Not a minter");
        // 不能移除创建者自己（可选，但为了安全建议保留创建者的minter权限）
        require(minter != creator, "Cannot remove creator");
        minters[minter] = false;
        emit MinterRemoved(minter);
    }
    
    /**
     * @dev 铸造 TrustStamp 给指定地址
     * @param to 接收者地址
     * @return tokenId 铸造的 NFT ID
     */
    function mint(address to) external onlyMinter returns (uint256) {
        _tokenIds++;
        uint256 newTokenId = _tokenIds;
        _safeMint(to, newTokenId);
        mintedAt[newTokenId] = block.timestamp;
        emit TrustStampMinted(to, newTokenId);
        return newTokenId;
    }
    
    /**
     * @dev 获取当前已铸造的总量
     */
    function totalSupply() external view returns (uint256) {
        return _tokenIds;
    }
    
    /**
     * @dev 批量查询地址是否持有此活动的 POAP（用于前端校验）
     */
    function balanceOfBatch(address[] calldata owners) external view returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](owners.length);
        for (uint i = 0; i < owners.length; i++) {
            balances[i] = balanceOf(owners[i]);
        }
        return balances;
    }
}