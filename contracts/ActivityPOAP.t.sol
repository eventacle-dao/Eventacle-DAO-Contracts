// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ActivityPOAP} from "./ActivityPOAP.sol";
import {Test} from "forge-std/Test.sol";

contract ActivityPOAPTest is Test {
    string constant MINT_META = "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye";
    event TrustStampMinted(address indexed to, uint256 indexed tokenId, string metadataURI);

    ActivityPOAP poap;
    address creator;
    address user1;
    address user2;

    function setUp() public {
        creator = makeAddr("creator");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        vm.prank(creator);
        poap = new ActivityPOAP("Test POAP", "TPOAP", creator);
    }

    function test_Constructor() public view {
        assertEq(poap.creator(), creator);
        assertTrue(poap.minters(creator));
        assertEq(poap.name(), "Test POAP");
        assertEq(poap.symbol(), "TPOAP");
        assertEq(poap.contractURI(), "");
        assertEq(poap.totalSupply(), 0);
    }

    function test_Mint_ByCreator() public {
        vm.prank(creator);
        uint256 tokenId = poap.mint(user1, MINT_META);
        assertEq(tokenId, 1);
        assertEq(poap.ownerOf(1), user1);
        assertEq(poap.balanceOf(user1), 1);
        assertEq(poap.totalSupply(), 1);
        assertEq(poap.mintedAt(1), block.timestamp);
        assertEq(poap.tokenURI(1), MINT_META);
    }

    function test_Mint_ByNonMinter_Reverts() public {
        vm.prank(user1);
        vm.expectRevert("Not authorized to mint");
        poap.mint(user2, MINT_META);
    }

    function test_AddMinter_ByCreator() public {
        vm.prank(creator);
        poap.addMinter(user1);
        assertTrue(poap.minters(user1));
        vm.prank(user1);
        poap.mint(user2, MINT_META);
        assertEq(poap.ownerOf(1), user2);
    }

    function test_AddMinter_ByNonCreator_Reverts() public {
        vm.prank(user1);
        vm.expectRevert("Only creator can add minter");
        poap.addMinter(user2);
    }

    function test_AddMinter_AlreadyMinter_Reverts() public {
        vm.prank(creator);
        vm.expectRevert("Already minter");
        poap.addMinter(creator);
    }

    function test_RemoveMinter_ByCreator() public {
        vm.prank(creator);
        poap.addMinter(user1);
        vm.prank(creator);
        poap.removeMinter(user1);
        assertFalse(poap.minters(user1));
        vm.prank(user1);
        vm.expectRevert("Not authorized to mint");
        poap.mint(user2, MINT_META);
    }

    function test_RemoveMinter_ByNonCreator_Reverts() public {
        vm.prank(creator);
        poap.addMinter(user1);
        vm.prank(user1);
        vm.expectRevert("Only creator can remove minter");
        poap.removeMinter(user1);
    }

    function test_RemoveMinter_NotMinter_Reverts() public {
        vm.prank(creator);
        vm.expectRevert("Not a minter");
        poap.removeMinter(user1);
    }

    function test_RemoveMinter_CannotRemoveCreator_Reverts() public {
        vm.prank(creator);
        vm.expectRevert("Cannot remove creator");
        poap.removeMinter(creator);
    }

    function test_TotalSupply() public {
        vm.prank(creator);
        poap.mint(user1, MINT_META);
        vm.prank(creator);
        poap.mint(user2, MINT_META);
        assertEq(poap.totalSupply(), 2);
    }

    function test_BalanceOfBatch() public {
        vm.prank(creator);
        poap.mint(user1, MINT_META);
        vm.prank(creator);
        poap.mint(user2, MINT_META);
        address[] memory owners = new address[](3);
        owners[0] = user1;
        owners[1] = user2;
        owners[2] = creator;
        uint256[] memory balances = poap.balanceOfBatch(owners);
        assertEq(balances[0], 1);
        assertEq(balances[1], 1);
        assertEq(balances[2], 0);
    }

    function test_Mint_TwiceToSameAddress_Reverts() public {
        vm.prank(creator);
        poap.mint(user1, MINT_META);
        vm.prank(creator);
        vm.expectRevert("POAP already claimed by this address");
        poap.mint(user1, MINT_META);
    }

    function test_PoapOf() public {
        assertEq(poap.poapOf(user1), 0);
        vm.prank(creator);
        poap.mint(user1, MINT_META);
        assertEq(poap.poapOf(user1), 1);
        assertEq(poap.poapOf(user2), 0);
    }

    function test_MintedAt_RecordsTimestamp() public {
        vm.prank(creator);
        poap.mint(user1, MINT_META);
        assertEq(poap.mintedAt(1), block.timestamp);
    }

    function test_Approve_Reverts() public {
        vm.prank(creator);
        poap.mint(user1, MINT_META);
        vm.prank(user1);
        vm.expectRevert("POAP is non-transferable");
        poap.approve(user2, 1);
    }

    function test_SetApprovalForAll_Reverts() public {
        vm.prank(creator);
        poap.mint(user1, MINT_META);
        vm.prank(user1);
        vm.expectRevert("POAP is non-transferable");
        poap.setApprovalForAll(user2, true);
    }

    function test_TransferFrom_Reverts() public {
        vm.prank(creator);
        poap.mint(user1, MINT_META);
        vm.prank(user1);
        vm.expectRevert("POAP is non-transferable");
        poap.transferFrom(user1, user2, 1);
    }

    function test_SafeTransferFrom_NoData_Reverts() public {
        vm.prank(creator);
        poap.mint(user1, MINT_META);
        vm.prank(user1);
        vm.expectRevert("POAP is non-transferable");
        poap.safeTransferFrom(user1, user2, 1);
    }

    function test_SafeTransferFrom_WithData_Reverts() public {
        vm.prank(creator);
        poap.mint(user1, MINT_META);
        vm.prank(user1);
        vm.expectRevert("POAP is non-transferable");
        poap.safeTransferFrom(user1, user2, 1, "");
    }

    function test_TrustStampMinted_Event() public {
        vm.prank(creator);
        vm.expectEmit(true, true, true, true);
        emit TrustStampMinted(user1, 1, MINT_META);
        poap.mint(user1, MINT_META);
    }

    function test_TokenIdsIncrementSequentially() public {
        vm.prank(creator);
        poap.mint(user1, MINT_META);
        assertEq(poap.poapOf(user1), 1);
        vm.prank(creator);
        poap.mint(user2, MINT_META);
        assertEq(poap.poapOf(user2), 2);
    }
}
