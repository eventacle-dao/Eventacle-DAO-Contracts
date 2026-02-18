import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress } from "viem";

import { network } from "hardhat";

const requiredStake = 100n * 10n ** 18n; // 100 INJ (18 decimals)

describe("ReviewStaking", async function () {
  const { viem } = await network.connect();
  const wallets = await viem.getWalletClients();
  const deployer = wallets[0]!;
  const alice = wallets[1]!;
  const bob = wallets[2]!;

  it("constructor sets requiredStake and owner", async function () {
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    assert.equal(await staking.read.requiredStake(), requiredStake);
    assert.equal(getAddress(await staking.read.owner()), getAddress(deployer.account!.address));
  });

  it("stake increases balance and hasReviewPermission when >= required", async function () {
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    assert.equal(await staking.read.stakedAmount([alice.account!.address]), 0n);
    assert.equal(await staking.read.hasReviewPermission([alice.account!.address]), false);

    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await stakingAsAlice.write.stake({ value: 50n * 10n ** 18n });
    assert.equal(await staking.read.stakedAmount([alice.account!.address]), 50n * 10n ** 18n);
    assert.equal(await staking.read.hasReviewPermission([alice.account!.address]), false);

    await stakingAsAlice.write.stake({ value: 50n * 10n ** 18n });
    assert.equal(await staking.read.stakedAmount([alice.account!.address]), requiredStake);
    assert.equal(await staking.read.hasReviewPermission([alice.account!.address]), true);
  });

  it("unstake decreases balance and revokes permission when below required", async function () {
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await stakingAsAlice.write.stake({ value: requiredStake });
    assert.equal(await staking.read.hasReviewPermission([alice.account!.address]), true);

    await stakingAsAlice.write.unstake([50n * 10n ** 18n]);
    assert.equal(await staking.read.stakedAmount([alice.account!.address]), 50n * 10n ** 18n);
    assert.equal(await staking.read.hasReviewPermission([alice.account!.address]), false);
  });

  it("setRequiredStake only callable by owner", async function () {
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await viem.assertions.revertWithCustomError(
      stakingAsAlice.write.setRequiredStake([200n * 10n ** 18n]),
      staking,
      "OwnableUnauthorizedAccount",
    );
    await staking.write.setRequiredStake([200n * 10n ** 18n]);
    assert.equal(await staking.read.requiredStake(), 200n * 10n ** 18n);
  });

  it("stake with zero value reverts with InsufficientStake", async function () {
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await viem.assertions.revertWithCustomError(
      stakingAsAlice.write.stake({ value: 0n }),
      staking,
      "InsufficientStake",
    );
  });

  it("unstake more than balance reverts with InsufficientBalance", async function () {
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const stakingAsAlice = await viem.getContractAt("ReviewStaking", staking.address, {
      client: { wallet: alice },
    });
    await stakingAsAlice.write.stake({ value: 10n * 10n ** 18n });
    await viem.assertions.revertWithCustomError(
      stakingAsAlice.write.unstake([20n * 10n ** 18n]),
      staking,
      "InsufficientBalance",
    );
  });

  it("direct transfer to contract (receive) credits sender and totalStaked", async function () {
    const staking = await viem.deployContract("ReviewStaking", [
      deployer.account!.address,
      requiredStake,
    ]);
    const amount = 50n * 10n ** 18n;
    await alice.sendTransaction({
      to: staking.address,
      value: amount,
    });
    assert.equal(await staking.read.stakedAmount([alice.account!.address]), amount);
    assert.equal(await staking.read.totalStaked(), amount);
    assert.equal(await staking.read.hasReviewPermission([alice.account!.address]), false);

    await alice.sendTransaction({
      to: staking.address,
      value: amount,
    });
    assert.equal(await staking.read.stakedAmount([alice.account!.address]), 100n * 10n ** 18n);
    assert.equal(await staking.read.totalStaked(), 100n * 10n ** 18n);
    assert.equal(await staking.read.hasReviewPermission([alice.account!.address]), true);
  });
});
