import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress } from "viem";

import { network } from "hardhat";

describe("ActivityComments", async function () {
  const { viem } = await network.connect();
  const wallets = await viem.getWalletClients();
  const deployer = wallets[0]!;
  const alice = wallets[1]!;
  const bob = wallets[2]!;

  it("constructor sets factory address", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const comments = await viem.deployContract("ActivityComments", [factory.address]);
    assert.equal(
      getAddress(await comments.read.factory()),
      getAddress(factory.address),
    );
  });

  it("postComment reverts for non-existent activity", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const comments = await viem.deployContract("ActivityComments", [factory.address]);
    await viem.assertions.revertWithCustomError(
      comments.write.postComment(["activity-999", "ipfs://QmX"]),
      comments,
      "ActivityNotFound",
    );
  });

  it("postComment reverts when caller has no POAP", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity([
      "Test Activity",
      "TA",
      "https://ipfs.io/ipfs/QmHash",
    ]);
    const comments = await viem.deployContract("ActivityComments", [factory.address]);
    await viem.assertions.revertWithCustomError(
      comments.write.postComment(["activity-1", "ipfs://QmX"]),
      comments,
      "NotPOAPHolder",
    );
  });

  it("postComment and getCommentCount / getComments", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity([
      "Test Activity",
      "TA",
      "https://ipfs.io/ipfs/QmHash",
    ]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([deployer.account!.address]);
    const comments = await viem.deployContract("ActivityComments", [factory.address]);
    assert.equal(await comments.read.getCommentCount(["activity-1"]), 0n);

    await comments.write.postComment(["activity-1", "ipfs://QmComment1"]);
    assert.equal(await comments.read.getCommentCount(["activity-1"]), 1n);

    const list = await comments.read.getComments(["activity-1"]);
    assert.equal(list.length, 1);
    const c = list[0] as {
      commenter: `0x${string}`;
      contentURI: string;
      reviewURI: string;
      isVisible: boolean;
      timestamp: bigint;
      replyToIndex: bigint;
    };
    assert.equal(getAddress(c.commenter), getAddress(deployer.account!.address));
    assert.equal(c.contentURI, "ipfs://QmComment1");
    assert.ok(c.timestamp > 0n);
  });

  it("getComment returns single comment", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x"]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([deployer.account!.address]);
    const comments = await viem.deployContract("ActivityComments", [factory.address]);
    await comments.write.postComment(["activity-1", "ipfs://QmOne"]);
    const [commenter, contentURI, reviewURI, isVisible, timestamp, replyToIndex] =
      await comments.read.getComment(["activity-1", 0n]);
    assert.equal(getAddress(commenter), getAddress(deployer.account!.address));
    assert.equal(contentURI, "ipfs://QmOne");
    assert.equal(reviewURI, "");
    assert.equal(isVisible, false);
    assert.ok(timestamp > 0n);
    const noParent = await comments.read.NO_PARENT();
    assert.equal(replyToIndex, noParent);
  });

  it("multiple users can comment on same activity", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x"]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([deployer.account!.address]);
    await poapAsAlice.write.mint([alice.account!.address]);
    await poapAsAlice.write.mint([bob.account!.address]);
    const comments = await viem.deployContract("ActivityComments", [factory.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    const commentsAsBob = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: bob },
    });
    await comments.write.postComment(["activity-1", "ipfs://first"]);
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://alice"]);
    await commentsAsBob.write.postComment(["activity-1", "ipfs://bob"]);
    assert.equal(await comments.read.getCommentCount(["activity-1"]), 3n);
    const list = await comments.read.getComments(["activity-1"]);
    const toUri = (x: { contentURI: string }) => x.contentURI;
    assert.equal(toUri(list[0]), "ipfs://first");
    assert.equal(toUri(list[1]), "ipfs://alice");
    assert.equal(toUri(list[2]), "ipfs://bob");
  });

  it("postReply links to comment by index", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x"]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([deployer.account!.address]);
    await poapAsAlice.write.mint([bob.account!.address]);
    const comments = await viem.deployContract("ActivityComments", [factory.address]);
    await comments.write.postComment(["activity-1", "ipfs://root"]);
    const commentsAsBob = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: bob },
    });
    await commentsAsBob.write.postReply(["activity-1", 0n, "ipfs://reply", "ipfs://review"]);
    assert.equal(await comments.read.getCommentCount(["activity-1"]), 2n);
    const [, , , , , replyTo0] = await comments.read.getComment(["activity-1", 0n]);
    const [, , , , , replyTo1] = await comments.read.getComment(["activity-1", 1n]);
    const noParent = await comments.read.NO_PARENT();
    assert.equal(replyTo0, noParent);
    assert.equal(replyTo1, 0n);
  });

  it("getComment out of range reverts", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address]);
    await viem.assertions.revertWith(
      comments.read.getComment(["activity-1", 0n]),
      "Comment index out of range",
    );
  });
});
