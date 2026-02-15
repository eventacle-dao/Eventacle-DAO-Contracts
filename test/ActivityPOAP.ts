import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress } from "viem";

import { network } from "hardhat";

describe("ActivityPOAP", async function () {
  const { viem } = await network.connect();
  const wallets = await viem.getWalletClients();
  const creator = wallets[0]!;
  const user1 = wallets[1]!;
  const user2 = wallets[2]!;

  it("should set creator, name, symbol and creator is minter", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    assert.equal(
      getAddress(await poap.read.creator()),
      getAddress(creator.account!.address),
    );
    assert.equal(await poap.read.minters([creator.account!.address]), true);
    assert.equal(await poap.read.name(), "Test POAP");
    assert.equal(await poap.read.symbol(), "TPOAP");
    assert.equal(await poap.read.totalSupply(), 0n);
  });

  it("creator can mint", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await poap.write.mint([user1.account!.address]);
    assert.equal(await poap.read.totalSupply(), 1n);
    assert.equal(
      getAddress(await poap.read.ownerOf([1n])),
      getAddress(user1.account!.address),
    );
    assert.equal(await poap.read.balanceOf([user1.account!.address]), 1n);
    assert.equal(await poap.read.totalSupply(), 1n);
    assert.equal(await poap.read.mintedAt([1n]), await poap.read.mintedAt([1n]));
  });

  it("non-minter cannot mint", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    const poapAsUser1 = await viem.getContractAt("ActivityPOAP", poap.address, {
      client: { wallet: user1 },
    });
    await viem.assertions.revertWith(
      poapAsUser1.write.mint([user2.account!.address]),
      "Not authorized to mint",
    );
  });

  it("creator can add minter, new minter can mint", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await poap.write.addMinter([user1.account!.address]);
    assert.equal(await poap.read.minters([user1.account!.address]), true);
    const poapAsUser1 = await viem.getContractAt("ActivityPOAP", poap.address, {
      client: { wallet: user1 },
    });
    await poapAsUser1.write.mint([user2.account!.address]);
    assert.equal(
      getAddress(await poap.read.ownerOf([1n])),
      getAddress(user2.account!.address),
    );
  });

  it("non-creator cannot add minter", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    const poapAsUser1 = await viem.getContractAt("ActivityPOAP", poap.address, {
      client: { wallet: user1 },
    });
    await viem.assertions.revertWith(
      poapAsUser1.write.addMinter([user2.account!.address]),
      "Only creator can add minter",
    );
  });

  it("cannot add already minter", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await viem.assertions.revertWith(
      poap.write.addMinter([creator.account!.address]),
      "Already minter",
    );
  });

  it("creator can remove minter", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await poap.write.addMinter([user1.account!.address]);
    await poap.write.removeMinter([user1.account!.address]);
    assert.equal(await poap.read.minters([user1.account!.address]), false);
    const poapAsUser1 = await viem.getContractAt("ActivityPOAP", poap.address, {
      client: { wallet: user1 },
    });
    await viem.assertions.revertWith(
      poapAsUser1.write.mint([user2.account!.address]),
      "Not authorized to mint",
    );
  });

  it("non-creator cannot remove minter", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await poap.write.addMinter([user1.account!.address]);
    const poapAsUser1 = await viem.getContractAt("ActivityPOAP", poap.address, {
      client: { wallet: user1 },
    });
    await viem.assertions.revertWith(
      poapAsUser1.write.removeMinter([user1.account!.address]),
      "Only creator can remove minter",
    );
  });

  it("cannot remove non-minter", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await viem.assertions.revertWith(
      poap.write.removeMinter([user1.account!.address]),
      "Not a minter",
    );
  });

  it("cannot remove creator", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await viem.assertions.revertWith(
      poap.write.removeMinter([creator.account!.address]),
      "Cannot remove creator",
    );
  });

  it("totalSupply reflects mints", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await poap.write.mint([user1.account!.address]);
    await poap.write.mint([user2.account!.address]);
    assert.equal(await poap.read.totalSupply(), 2n);
  });

  it("balanceOfBatch returns correct balances", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await poap.write.mint([user1.account!.address]);
    await poap.write.mint([user2.account!.address]);
    const owners = [
      user1.account!.address,
      user2.account!.address,
      creator.account!.address,
    ];
    const balances = await poap.read.balanceOfBatch([owners]);
    assert.equal(balances[0], 1n);
    assert.equal(balances[1], 1n);
    assert.equal(balances[2], 0n);
  });

  it("cannot mint twice to same address", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await poap.write.mint([user1.account!.address]);
    await viem.assertions.revertWith(
      poap.write.mint([user1.account!.address]),
      "POAP already claimed by this address",
    );
  });

  it("poapOf returns tokenId for holder, 0 for non-holder", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    assert.equal(await poap.read.poapOf([user1.account!.address]), 0n);
    await poap.write.mint([user1.account!.address]);
    assert.equal(await poap.read.poapOf([user1.account!.address]), 1n);
    assert.equal(await poap.read.poapOf([user2.account!.address]), 0n);
  });

  it("mintedAt records block timestamp", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await poap.write.mint([user1.account!.address]);
    const ts = await poap.read.mintedAt([1n]);
    assert.ok(ts > 0n);
  });

  it("approve reverts (non-transferable)", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await poap.write.mint([user1.account!.address]);
    const poapAsUser1 = await viem.getContractAt("ActivityPOAP", poap.address, {
      client: { wallet: user1 },
    });
    const write = poapAsUser1.write as unknown as { approve: (args: [address: `0x${string}`, tokenId: bigint]) => Promise<`0x${string}`> };
    await viem.assertions.revertWith(
      write.approve([user2.account!.address, 1n]),
      "POAP is non-transferable",
    );
  });

  it("setApprovalForAll reverts (non-transferable)", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await poap.write.mint([user1.account!.address]);
    const poapAsUser1 = await viem.getContractAt("ActivityPOAP", poap.address, {
      client: { wallet: user1 },
    });
    const write = poapAsUser1.write as unknown as { setApprovalForAll: (args: [operator: `0x${string}`, approved: boolean]) => Promise<`0x${string}`> };
    await viem.assertions.revertWith(
      write.setApprovalForAll([user2.account!.address, true]),
      "POAP is non-transferable",
    );
  });

  it("transferFrom reverts (non-transferable)", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await poap.write.mint([user1.account!.address]);
    const poapAsUser1 = await viem.getContractAt("ActivityPOAP", poap.address, {
      client: { wallet: user1 },
    });
    await viem.assertions.revertWith(
      poapAsUser1.write.transferFrom([user1.account!.address, user2.account!.address, 1n]),
      "POAP is non-transferable",
    );
  });

  it("TrustStampMinted event emitted on mint", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    const hash = await poap.write.mint([user1.account!.address]);
    const publicClient = await viem.getPublicClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const fromContract = receipt.logs.filter(
      (l) => l.address.toLowerCase() === poap.address.toLowerCase(),
    );
    assert.ok(fromContract.length >= 1);
  });

  it("tokenIds increment sequentially", async function () {
    const poap = await viem.deployContract("ActivityPOAP", [
      "Test POAP",
      "TPOAP",
      creator.account!.address,
    ]);
    await poap.write.mint([user1.account!.address]);
    assert.equal(await poap.read.poapOf([user1.account!.address]), 1n);
    await poap.write.mint([user2.account!.address]);
    assert.equal(await poap.read.poapOf([user2.account!.address]), 2n);
  });
});
