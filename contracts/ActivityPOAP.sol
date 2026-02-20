// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title ActivityPOAP
 * @dev 每个活动独立的出席证明 NFT（TrustStamp）。
 *      POAP 不可转让，每个地址至多持有一个；铸造权限由 minter 管理，创建者可自由添加/移除 minter。
 *      Eventacle 协议无权干预。
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

    // 铸造时绑定的每个 token 的元数据 URI（徽章图像/展示用）
    mapping(uint256 => string) private _tokenMetadataURI;

    // 每个持有地址对应的 tokenId（最多持有一个POAP，无则为0）
    mapping(address => uint256) private poapTokenOf;

    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event TrustStampMinted(address indexed to, uint256 indexed tokenId, string metadataURI);

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
        require(minter != creator, "Cannot remove creator");
        minters[minter] = false;
        emit MinterRemoved(minter);
    }
    
    /**
     * @dev 铸造 TrustStamp 给指定地址，并在铸造时绑定该 token 的元数据 URI。不可重复领取。
     * @param to 接收者地址
     * @param tokenMetadataURI 该 POAP token 的元数据 URI（徽章图像/展示用）
     * @return tokenId 铸造的 NFT ID
     */
    function mint(address to, string memory tokenMetadataURI) external onlyMinter returns (uint256) {
        require(balanceOf(to) == 0, "POAP already claimed by this address");
        _tokenIds++;
        uint256 newTokenId = _tokenIds;
        _safeMint(to, newTokenId);
        mintedAt[newTokenId] = block.timestamp;
        _tokenMetadataURI[newTokenId] = tokenMetadataURI;
        poapTokenOf[to] = newTokenId;
        emit TrustStampMinted(to, newTokenId, tokenMetadataURI);
        return newTokenId;
    }

    /**
     * @dev Address 拥有的唯一 POAP tokenId，如未领取则为0
     */
    function poapOf(address owner) external view returns (uint256) {
        if (balanceOf(owner) == 0) return 0;
        return poapTokenOf[owner];
    }
    
    /**
     * @dev 获取当前已铸造的总量
     */
    function totalSupply() external view returns (uint256) {
        return _tokenIds;
    }

    /**
     * @dev 集合级元数据 URI（无统一集合 URI 时返回空）
     */
    function contractURI() external pure returns (string memory) {
        return "";
    }

    /**
     * @dev 返回铸造时绑定的该 token 的元数据 URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenMetadataURI[tokenId];
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

    /**
     * @dev Override _update to block transfers. Mint (from==0) and burn (to==0) allowed.
     */
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert("POAP is non-transferable");
        }
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert("POAP is non-transferable");
    }

    function setApprovalForAll(address, bool) public pure override {
        revert("POAP is non-transferable");
    }
}