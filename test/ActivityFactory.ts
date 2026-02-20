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
    await factoryAsAlice.write.createActivity(["Hackathon 2026 Attendance", "H26", "https://ipfs.io/ipfs/QmHash123", 0n, 2n ** 256n - 1n, 3]);
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
    await factoryAsAlice.write.createActivity(["Activity A", "AA", "https://ipfs.io/ipfs/QmHash123", 0n, 2n ** 256n - 1n, 3]);
    await factoryAsBob.write.createActivity(["Activity B", "AB", "https://ipfs.io/ipfs/QmHash123", 0n, 2n ** 256n - 1n, 3]);
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
    await factoryAsAlice.write.createActivity(["Test", "T", "https://ipfs.io/ipfs/QmHash123", 0n, 2n ** 256n - 1n, 3]);
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

  describe("worst-case: getOngoingActivityIdsPaginated", () => {
    it("offset >= total returns empty, no OOB", async function () {
      const factory = await viem.deployContract("ActivityFactory");
      const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
        client: { wallet: alice },
      });
      await factoryAsAlice.write.createActivity(["A", "A", "ipfs://QmA", 0n, 200n, 3]);
      await factoryAsAlice.write.createActivity(["B", "B", "ipfs://QmB", 0n, 200n, 3]);
      await factoryAsAlice.write.createActivity(["C", "C", "ipfs://QmC", 0n, 200n, 3]);
      const ids = await factory.read.getAllActivityIds();
      const total = BigInt(ids.length);
      const [ongoing, nextOffset, firstOngoingIndex, needUpdateOffset] =
        await factory.read.getOngoingActivityIdsPaginated([total, 10n]);
      assert.equal(ongoing.length, 0);
      assert.equal(nextOffset, total);
      assert.equal(firstOngoingIndex, total);
      assert.equal(needUpdateOffset, false);
    });

    it("limit 0 returns empty array", async function () {
      const factory = await viem.deployContract("ActivityFactory");
      const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
        client: { wallet: alice },
      });
      await factoryAsAlice.write.createActivity(["A", "A", "ipfs://QmA", 0n, 200n, 3]);
      const ids = await factory.read.getAllActivityIds();
      const total = BigInt(ids.length);
      const [ongoing, nextOffset, firstOngoingIndex] =
        await factory.read.getOngoingActivityIdsPaginated([0n, 0n]);
      assert.equal(ongoing.length, 0);
      assert.equal(nextOffset, 0n);
      assert.equal(firstOngoingIndex, total);
    });

    it("first loop finds ended, returns needUpdateOffset true", async function () {
      const factory = await viem.deployContract("ActivityFactory");
      const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
        client: { wallet: alice },
      });
      for (let i = 0; i < 15; i++) {
        await factoryAsAlice.write.createActivity(["P", "P", "ipfs://p", 0n, 1n, 3]);
      }
      const [ongoing, nextOffset, firstOngoingIndex, needUpdateOffset] =
        await factory.read.getOngoingActivityIdsPaginated([10n, 10n]);
      assert.equal(ongoing.length, 0);
      assert.equal(nextOffset, 10n);
      assert.equal(firstOngoingIndex, 10n);
      assert.equal(needUpdateOffset, true);
    });

    it("first ongoing gap > 50, needUpdateOffset true", async function () {
      const factory = await viem.deployContract("ActivityFactory");
      const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
        client: { wallet: alice },
      });
      for (let i = 0; i < 55; i++) {
        await factoryAsAlice.write.createActivity(["Past", "P", "ipfs://past", 0n, 1n, 3]);
      }
      await factoryAsAlice.write.createActivity([
        "Ongoing",
        "O",
        "ipfs://ongoing",
        0n,
        2n ** 256n - 1n,
        3,
      ]);
      const [ongoing, nextOffset, firstOngoingIndex, needUpdateOffset] =
        await factory.read.getOngoingActivityIdsPaginated([0n, 10n]);
      assert.equal(ongoing.length, 1);
      assert.equal(ongoing[0], "activity-56");
      assert.equal(nextOffset, 56n);
      assert.equal(firstOngoingIndex, 55n);
      assert.equal(needUpdateOffset, true);
    });
  });

  describe("worst-case: scanAndUpdateOngoingOffsetIfNeeded", () => {
    it("total 0, no activities", async function () {
      const factory = await viem.deployContract("ActivityFactory");
      await factory.write.scanAndUpdateOngoingOffsetIfNeeded();
      assert.equal(await factory.read.nextOngoingScanOffset(), 0n);
    });

    it("total < 5, no ongoing, sets offset 0 no underflow", async function () {
      const factory = await viem.deployContract("ActivityFactory");
      const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
        client: { wallet: alice },
      });
      for (let i = 0; i < 3; i++) {
        await factoryAsAlice.write.createActivity(["Past", "P", "ipfs://past", 0n, 1n, 3]);
      }
      await factory.write.scanAndUpdateOngoingOffsetIfNeeded();
      assert.equal(await factory.read.nextOngoingScanOffset(), 0n);
    });

    it("find in first 10 with startOffset 0, sets newOffset 0", async function () {
      const factory = await viem.deployContract("ActivityFactory");
      const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
        client: { wallet: alice },
      });
      await factoryAsAlice.write.createActivity([
        "Ongoing",
        "O",
        "ipfs://ongoing",
        0n,
        2n ** 256n - 1n,
        3,
      ]);
      for (let i = 0; i < 4; i++) {
        await factoryAsAlice.write.createActivity(["Past", "P", "ipfs://past", 0n, 1n, 3]);
      }
      assert.equal(await factory.read.nextOngoingScanOffset(), 0n);
      await factory.write.scanAndUpdateOngoingOffsetIfNeeded();
      assert.equal(await factory.read.nextOngoingScanOffset(), 0n);
    });
  });
});
