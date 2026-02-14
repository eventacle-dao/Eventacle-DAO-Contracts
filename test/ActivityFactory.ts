import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress } from "viem";

import { network } from "hardhat";

describe("ActivityFactory", async function () {
  const { viem } = await network.connect();
  const wallets = await viem.getWalletClients();
  const deployer = wallets[0]!;
  const alice = wallets[1]!;
  const bob = wallets[2]!;

  it("should set deployer as owner", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    assert.equal(
      getAddress(await factory.read.owner()),
      getAddress(deployer.account!.address),
    );
  });

  it("anyone can create activity, activityId auto-generated and createdAt recorded", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["Hackathon 2026 Attendance", "H26", "https://ipfs.io/ipfs/QmHash123"]);
    const ids = await factory.read.getAllActivityIds();
    assert.equal(ids.length, 1);
    const activityId = ids[0];
    assert.equal(activityId, "activity-1");

    const poapAddress = await factory.read.getPOAPContract([activityId]);
    assert.notEqual(poapAddress, "0x0000000000000000000000000000000000000000");
    assert.equal(
      getAddress(await factory.read.getActivityCreator([activityId])),
      getAddress(alice.account!.address),
    );
    const createdAt = await factory.read.getActivityCreatedAt([activityId]);
    assert.ok(createdAt > 0n);

    const poap = await viem.getContractAt("ActivityPOAP", poapAddress);
    assert.equal(
      getAddress(await poap.read.creator()),
      getAddress(alice.account!.address),
    );
    assert.equal(await poap.read.name(), "Hackathon 2026 Attendance");
    assert.equal(await poap.read.symbol(), "H26");
  });

  it("createActivity auto-increments activityId", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    const factoryAsBob = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: bob },
    });
    await factoryAsAlice.write.createActivity(["Activity A", "AA", "https://ipfs.io/ipfs/QmHash123"]);
    await factoryAsBob.write.createActivity(["Activity B", "AB", "https://ipfs.io/ipfs/QmHash123"]);
    const ids = await factory.read.getAllActivityIds();
    assert.equal(ids.length, 2);
    assert.equal(ids[0], "activity-1");
    assert.equal(ids[1], "activity-2");
  });

  it("getActivityCreatedAt returns block timestamp", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["Test", "T", "https://ipfs.io/ipfs/QmHash123"]);
    const createdAt = await factory.read.getActivityCreatedAt(["activity-1"]);
    assert.ok(createdAt > 0n);
  });

  it("owner can renounceOwnership", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    await factory.write.renounceOwnership();
    const owner = await factory.read.owner();
    assert.equal(owner.toLowerCase(), "0x0000000000000000000000000000000000000000");
  });

  it("non-owner cannot renounceOwnership", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await viem.assertions.revertWithCustomError(
      factoryAsAlice.write.renounceOwnership(),
      factory,
      "OwnableUnauthorizedAccount",
    );
  });
});
