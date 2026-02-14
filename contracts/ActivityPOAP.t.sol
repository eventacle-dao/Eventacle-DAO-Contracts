// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ActivityPOAP} from "./ActivityPOAP.sol";
import {Test} from "forge-std/Test.sol";

contract ActivityPOAPTest is Test {
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
        assertEq(poap.totalSupply(), 0);
    }

    function test_Mint_ByCreator() public {
        vm.prank(creator);
        uint256 tokenId = poap.mint(user1);
        assertEq(tokenId, 1);
        assertEq(poap.ownerOf(1), user1);
        assertEq(poap.balanceOf(user1), 1);
        assertEq(poap.totalSupply(), 1);
        assertEq(poap.mintedAt(1), block.timestamp);
    }

    function test_Mint_ByNonMinter_Reverts() public {
        vm.prank(user1);
        vm.expectRevert("Not authorized to mint");
        poap.mint(user2);
    }

    function test_AddMinter_ByCreator() public {
        vm.prank(creator);
        poap.addMinter(user1);
        assertTrue(poap.minters(user1));
        vm.prank(user1);
        poap.mint(user2);
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
        poap.mint(user2);
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
        poap.mint(user1);
        vm.prank(creator);
        poap.mint(user2);
        assertEq(poap.totalSupply(), 2);
    }

    function test_BalanceOfBatch() public {
        vm.prank(creator);
        poap.mint(user1);
        vm.prank(creator);
        poap.mint(user1);
        vm.prank(creator);
        poap.mint(user2);
        address[] memory owners = new address[](3);
        owners[0] = user1;
        owners[1] = user2;
        owners[2] = creator;
        uint256[] memory balances = poap.balanceOfBatch(owners);
        assertEq(balances[0], 2);
        assertEq(balances[1], 1);
        assertEq(balances[2], 0);
    }
}
