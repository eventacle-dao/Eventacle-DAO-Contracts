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

  const ZERO = "0x0000000000000000000000000000000000000000" as const;

  it("constructor sets factory and reviewGate", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
    assert.equal(getAddress(await comments.read.factory()), getAddress(factory.address));
    assert.equal(await comments.read.reviewGate(), ZERO);
  });

  it("getCommentCount returns 0 for empty or non-existent activity", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
    assert.equal(await comments.read.getCommentCount(["activity-1"]), 0n);
    assert.equal(await comments.read.getCommentCount(["activity-999"]), 0n);
  });

  it("getComments returns empty array when no comments", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
    const list = await comments.read.getComments(["activity-1"]);
    assert.equal(list.length, 0);
  });

  it("postComment reverts for non-existent activity", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
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
      0n,
      2n ** 256n - 1n,
      3,
    ]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
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
      0n,
      2n ** 256n - 1n,
      3,
    ]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([deployer.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
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
      inQuestion: boolean;
      reviewer: `0x${string}`;
      reviewTimestamp: bigint;
      timestamp: bigint;
      commentType: number;
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
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([deployer.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
    await comments.write.postComment(["activity-1", "ipfs://QmOne"]);
    const [commenter, contentURI, reviewURI, isVisible, inQuestion, timestamp, replyToIndex] =
      await comments.read.getComment(["activity-1", 0n]);
    assert.equal(getAddress(commenter), getAddress(deployer.account!.address));
    assert.equal(contentURI, "ipfs://QmOne");
    assert.equal(reviewURI, "");
    assert.equal(isVisible, false);
    assert.equal(inQuestion, false);
    assert.ok(timestamp > 0n);
    const noParent = await comments.read.NO_PARENT();
    assert.equal(replyToIndex, noParent);
  });

  it("multiple users can comment on same activity", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([deployer.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    await poapAsAlice.write.mint([bob.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
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
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([deployer.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    await poapAsAlice.write.mint([bob.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
    await comments.write.postComment(["activity-1", "ipfs://root"]);
    const commentsAsBob = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: bob },
    });
    await commentsAsBob.write.postReply(["activity-1", 0n, "ipfs://reply", "ipfs://review"]);
    assert.equal(await comments.read.getCommentCount(["activity-1"]), 2n);
    const [, , , , , , replyTo0] = await comments.read.getComment(["activity-1", 0n]);
    const [, , , , , , replyTo1] = await comments.read.getComment(["activity-1", 1n]);
    const noParent = await comments.read.NO_PARENT();
    assert.equal(replyTo0, noParent);
    assert.equal(replyTo1, 0n);
  });

  it("getComment out of range reverts", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
    await viem.assertions.revertWith(
      comments.read.getComment(["activity-1", 0n]),
      "Comment index out of range",
    );
  });

  it("postReply reverts for non-existent activity", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
    await viem.assertions.revertWithCustomError(
      comments.write.postReply(["activity-999", 0n, "ipfs://x", ""]),
      comments,
      "ActivityNotFound",
    );
  });

  it("postReply reverts when caller has no POAP", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://root"]);
    await viem.assertions.revertWithCustomError(
      comments.write.postReply(["activity-1", 0n, "ipfs://x", ""]),
      comments,
      "NotPOAPHolder",
    );
  });

  it("setCommentVisible reverts when reviewGate is zero (NoReviewGate)", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    await viem.assertions.revertWithCustomError(
      commentsAsAlice.write.setCommentVisible(["activity-1", 0n, true]),
      comments,
      "NoReviewGate",
    );
  });

  it("setCommentVisible works when caller has review permission via ReviewStaking", async function () {
    const requiredStake = 100n * 10n ** 18n;
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, staking.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    let [, , , isVisible] = await comments.read.getComment(["activity-1", 0n]);
    assert.equal(isVisible, false);

    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await stakingAsAlice.write.stake({ value: requiredStake });
    await commentsAsAlice.write.setCommentVisible(["activity-1", 0n, true]);
    [, , , isVisible, , ,] = await comments.read.getComment(["activity-1", 0n]);
    assert.equal(isVisible, true);

    await commentsAsAlice.write.setCommentVisible(["activity-1", 0n, false]);
    [, , , isVisible, , ,] = await comments.read.getComment(["activity-1", 0n]);
    assert.equal(isVisible, false);
  });

  it("setCommentVisible reverts when caller has no review permission (NotReviewer)", async function () {
    const requiredStake = 100n * 10n ** 18n;
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, staking.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    await viem.assertions.revertWithCustomError(
      commentsAsAlice.write.setCommentVisible(["activity-1", 0n, true]),
      comments,
      "NotReviewer",
    );
  });

  it("setCommentVisible reverts when comment index out of range", async function () {
    const requiredStake = 100n * 10n ** 18n;
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, staking.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await stakingAsAlice.write.stake({ value: requiredStake });
    await viem.assertions.revertWithCustomError(
      commentsAsAlice.write.setCommentVisible(["activity-1", 1n, true]),
      comments,
      "CommentIndexOutOfRange",
    );
  });

  it("setCommentInQuestion reverts when reviewGate is zero (NoReviewGate)", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    await viem.assertions.revertWithCustomError(
      commentsAsAlice.write.setCommentInQuestion(["activity-1", 0n, true]),
      comments,
      "NoReviewGate",
    );
  });

  it("setCommentInQuestion reverts when caller has no review permission (NotReviewer)", async function () {
    const requiredStake = 100n * 10n ** 18n;
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, staking.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    await viem.assertions.revertWithCustomError(
      commentsAsAlice.write.setCommentInQuestion(["activity-1", 0n, true]),
      comments,
      "NotReviewer",
    );
  });

  it("setCommentInQuestion reverts when comment index out of range", async function () {
    const requiredStake = 100n * 10n ** 18n;
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, staking.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await stakingAsAlice.write.stake({ value: requiredStake });
    await viem.assertions.revertWithCustomError(
      commentsAsAlice.write.setCommentInQuestion(["activity-1", 1n, true]),
      comments,
      "CommentIndexOutOfRange",
    );
  });

  it("setCommentInQuestion reverts when caller is the reviewer (CannotSetInQuestionSelf)", async function () {
    const requiredStake = 100n * 10n ** 18n;
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, staking.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await stakingAsAlice.write.stake({ value: requiredStake });
    await commentsAsAlice.write.reviewComment(["activity-1", 0n, "ipfs://review", true]);
    await viem.assertions.revertWithCustomError(
      commentsAsAlice.write.setCommentInQuestion(["activity-1", 0n, true]),
      comments,
      "CannotSetInQuestionSelf",
    );
  });

  it("setCommentInQuestion: other reviewer can set inQuestion", async function () {
    const requiredStake = 100n * 10n ** 18n;
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    await poapAsAlice.write.mint([bob.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, staking.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    const commentsAsBob = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: bob },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    const stakingAsBob = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: bob },
    });
    await stakingAsBob.write.stake({ value: requiredStake });
    await commentsAsBob.write.reviewComment(["activity-1", 0n, "ipfs://review", true]);
    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await stakingAsAlice.write.stake({ value: requiredStake });
    await commentsAsAlice.write.setCommentInQuestion(["activity-1", 0n, true]);
    const [, , , , inQuestion] = await comments.read.getComment(["activity-1", 0n]);
    assert.equal(inQuestion, true);
  });

  it("setCommentInQuestion sets inQuestion and getComment reflects it", async function () {
    const requiredStake = 100n * 10n ** 18n;
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, staking.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await stakingAsAlice.write.stake({ value: requiredStake });

    let [, , , , inQuestion] = await comments.read.getComment(["activity-1", 0n]);
    assert.equal(inQuestion, false);
    await commentsAsAlice.write.setCommentInQuestion(["activity-1", 0n, true]);
    [, , , , inQuestion] = await comments.read.getComment(["activity-1", 0n]);
    assert.equal(inQuestion, true);
    await commentsAsAlice.write.setCommentInQuestion(["activity-1", 0n, false]);
    [, , , , inQuestion] = await comments.read.getComment(["activity-1", 0n]);
    assert.equal(inQuestion, false);
  });

  it("reviewComment reverts when reviewGate is zero (NoReviewGate)", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    await viem.assertions.revertWithCustomError(
      commentsAsAlice.write.reviewComment(["activity-1", 0n, "ipfs://review", true]),
      comments,
      "NoReviewGate",
    );
  });

  it("reviewComment reverts when caller has no review permission (NotReviewer)", async function () {
    const requiredStake = 100n * 10n ** 18n;
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, staking.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    await viem.assertions.revertWithCustomError(
      commentsAsAlice.write.reviewComment(["activity-1", 0n, "ipfs://review", true]),
      comments,
      "NotReviewer",
    );
  });

  it("reviewComment reverts when comment index out of range", async function () {
    const requiredStake = 100n * 10n ** 18n;
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, staking.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await stakingAsAlice.write.stake({ value: requiredStake });
    await viem.assertions.revertWithCustomError(
      commentsAsAlice.write.reviewComment(["activity-1", 1n, "ipfs://review", true]),
      comments,
      "CommentIndexOutOfRange",
    );
  });

  it("reviewComment sets reviewURI and isVisible; getComments has reviewer and reviewTimestamp", async function () {
    const requiredStake = 100n * 10n ** 18n;
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, staking.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await stakingAsAlice.write.stake({ value: requiredStake });
    await commentsAsAlice.write.reviewComment(["activity-1", 0n, "ipfs://reviewMeta", true]);

    const [, contentURI, reviewURI, isVisible] = await comments.read.getComment(["activity-1", 0n]);
    assert.equal(contentURI, "ipfs://c");
    assert.equal(reviewURI, "ipfs://reviewMeta");
    assert.equal(isVisible, true);

    const list = await comments.read.getComments(["activity-1"]);
    const c = list[0] as {
      commenter: `0x${string}`;
      contentURI: string;
      reviewURI: string;
      isVisible: boolean;
      inQuestion: boolean;
      reviewer: `0x${string}`;
      reviewTimestamp: bigint;
      timestamp: bigint;
      commentType: number;
      replyToIndex: bigint;
    };
    assert.equal(getAddress(c.reviewer), getAddress(alice.account!.address));
    assert.ok(c.reviewTimestamp > 0n);
  });

  it("reviewComment reverts when already reviewed (CommentAlreadyReviewed)", async function () {
    const requiredStake = 100n * 10n ** 18n;
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([alice.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, staking.address]);
    const commentsAsAlice = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: alice },
    });
    await commentsAsAlice.write.postComment(["activity-1", "ipfs://c"]);
    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await stakingAsAlice.write.stake({ value: requiredStake });
    await commentsAsAlice.write.reviewComment(["activity-1", 0n, "ipfs://r", true]);
    await viem.assertions.revertWithCustomError(
      commentsAsAlice.write.reviewComment(["activity-1", 0n, "ipfs://r2", false]),
      comments,
      "CommentAlreadyReviewed",
    );
  });

  it("getComments returns full struct with commentType and replyToIndex (normal and reply)", async function () {
    const factory = await viem.deployContract("ActivityFactory");
    const factoryAsAlice = await viem.getContractAt("ActivityFactory", factory.address, {
      client: { wallet: alice },
    });
    await factoryAsAlice.write.createActivity(["A", "A", "https://x", 0n, 2n ** 256n - 1n, 3]);
    const poapAddress = await factory.read.getPOAPContract(["activity-1"]);
    const poapAsAlice = await viem.getContractAt("ActivityPOAP", poapAddress, {
      client: { wallet: alice },
    });
    await poapAsAlice.write.mint([deployer.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    await poapAsAlice.write.mint([bob.account!.address, "ipfs://bafkreifgr3fkhfzihay7tia2wi4cwzdixg6p7gokknnym6brgc6xmzc5ye"]);
    const comments = await viem.deployContract("ActivityComments", [factory.address, ZERO]);
    await comments.write.postComment(["activity-1", "ipfs://root"]);
    const commentsAsBob = await viem.getContractAt("ActivityComments", comments.address, {
      client: { wallet: bob },
    });
    await commentsAsBob.write.postReply(["activity-1", 0n, "ipfs://reply", ""]);
    const list = await comments.read.getComments(["activity-1"]);
    assert.equal(list.length, 2);

    const noParent = await comments.read.NO_PARENT();
    type CommentItem = {
      commenter: `0x${string}`;
      contentURI: string;
      reviewURI: string;
      isVisible: boolean;
      inQuestion: boolean;
      reviewer: `0x${string}`;
      reviewTimestamp: bigint;
      timestamp: bigint;
      commentType: number;
      replyToIndex: bigint;
    };
    const c0 = list[0] as CommentItem;
    const c1 = list[1] as CommentItem;
    assert.equal(c0.contentURI, "ipfs://root");
    assert.equal(Number(c0.commentType), 0);
    assert.equal(c0.replyToIndex, noParent);
    assert.equal(c1.contentURI, "ipfs://reply");
    assert.equal(Number(c1.commentType), 1);
    assert.equal(c1.replyToIndex, 0n);
  });
});
