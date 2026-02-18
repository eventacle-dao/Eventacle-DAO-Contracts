/**
 * 检查已部署的 ActivityFactory、ReviewStaking（可选）、ActivityComments（可选）。
 * 地址来源：环境变量或 deployments/<network>.json。
 *
 * 选网（环境变量）：
 *   DEPLOY_NETWORK=inj_testnet bunx hardhat run scripts/check-deployment.js
 *   DEPLOY_NETWORK=inj_mainnet bunx hardhat run scripts/check-deployment.js
 * 可选环境变量：ACTIVITY_FACTORY_ADDRESS, REVIEW_STAKING_ADDRESS, ACTIVITY_COMMENTS_ADDRESS
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { default: hre } = await import("hardhat");
const { viem } = await hre.network.connect();

function getNetworkFromEnv() {
  const raw = (process.env.DEPLOY_NETWORK || process.env.NETWORK || "").trim().toLowerCase();
  if (raw === "testnet" || raw === "inj_testnet") return "inj_testnet";
  if (raw === "mainnet" || raw === "inj_mainnet") return "inj_mainnet";
  if (["inj_testnet", "inj_mainnet"].includes(raw)) return raw;
  return null;
}

async function main() {
  const chosen = getNetworkFromEnv();
  if (!chosen) {
    console.error("请设置环境变量 DEPLOY_NETWORK=inj_testnet 或 DEPLOY_NETWORK=inj_mainnet");
    process.exit(1);
  }
  const isChild = process.env.__DEPLOY_REEXEC === "1";
  if (!isChild && hre.network?.name !== chosen) {
    console.log("切换网络:", chosen);
    execSync(`bunx hardhat run scripts/check-deployment.js --network ${chosen}`, {
      stdio: "inherit",
      cwd: join(__dirname, ".."),
      env: { ...process.env, __DEPLOY_REEXEC: "1" },
    });
    process.exit(0);
  }
  const network = hre.network?.name || chosen;
  function loadDeployments() {
    try {
      const path = join(__dirname, "..", "deployments", `${network}.json`);
      if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
    } catch {}
    return null;
  }
  const deployment = loadDeployments();
  const FACTORY_ADDRESS = process.env.ACTIVITY_FACTORY_ADDRESS || deployment?.factory || "";
  const STAKING_ADDRESS = process.env.REVIEW_STAKING_ADDRESS || deployment?.reviewStaking || "";
  const COMMENTS_ADDRESS = process.env.ACTIVITY_COMMENTS_ADDRESS || deployment?.comments || "";

  const INJ_DECIMALS = 18;
  const formatInj = (wei) => (Number(wei) / 10 ** INJ_DECIMALS).toFixed(6) + " INJ";

  if (!FACTORY_ADDRESS) {
    console.error("未设置 ACTIVITY_FACTORY_ADDRESS 或 deployments/<network>.json 中无 factory 地址");
    return;
  }

  const publicClient = await viem.getPublicClient();

  console.log("\n--- ActivityFactory 链上检查 ---");
  console.log("合约地址:", FACTORY_ADDRESS);
  const factoryCode = await publicClient.getBytecode({ address: FACTORY_ADDRESS });
  const factoryHasCode = factoryCode && factoryCode.length > 2;
  console.log("链上是否有代码:", factoryHasCode ? "是" : "否");

  if (!factoryHasCode) {
    console.log("该地址无合约代码，可能未部署或地址错误。");
    console.log("--- 检查结束 ---\n");
    return;
  }

  const factory = await viem.getContractAt("ActivityFactory", FACTORY_ADDRESS);
  let owner;
  try {
    owner = await factory.read.owner();
  } catch {
    owner = "(调用失败或已 renounce)";
  }
  const activityIds = await factory.read.getAllActivityIds();
  console.log("Owner:", owner);
  console.log("当前活动数量:", activityIds.length);
  console.log("活动 ID 列表:", activityIds.length ? activityIds : "(暂无)");

  if (STAKING_ADDRESS) {
    console.log("\n--- ReviewStaking 链上检查 ---");
    console.log("合约地址:", STAKING_ADDRESS);
    const stakingCode = await publicClient.getBytecode({ address: STAKING_ADDRESS });
    const stakingHasCode = stakingCode && stakingCode.length > 2;
    console.log("链上是否有代码:", stakingHasCode ? "是" : "否");
    if (stakingHasCode) {
      const staking = await viem.getContractAt("ReviewStaking", STAKING_ADDRESS);
      let stakingOwner;
      try {
        stakingOwner = await staking.read.owner();
      } catch {
        stakingOwner = "(调用失败)";
      }
      const requiredStake = await staking.read.requiredStake();
      const totalStaked = await staking.read.totalStaked();
      console.log("Owner:", stakingOwner);
      console.log("获得 review 权限所需质押:", formatInj(requiredStake));
      console.log("当前总质押量:", formatInj(totalStaked));
    }
  } else {
    console.log("\n(未配置 REVIEW_STAKING_ADDRESS，跳过 ReviewStaking 检查)");
  }

  if (COMMENTS_ADDRESS) {
    console.log("\n--- ActivityComments 链上检查 ---");
    console.log("合约地址:", COMMENTS_ADDRESS);
    const commentsCode = await publicClient.getBytecode({ address: COMMENTS_ADDRESS });
    const commentsHasCode = commentsCode && commentsCode.length > 2;
    console.log("链上是否有代码:", commentsHasCode ? "是" : "否");
    if (commentsHasCode) {
      const comments = await viem.getContractAt("ActivityComments", COMMENTS_ADDRESS);
      const boundFactory = await comments.read.factory();
      const reviewGate = await comments.read.reviewGate();
      const zeroAddr = "0x0000000000000000000000000000000000000000";
      console.log("绑定的 Factory:", boundFactory);
      console.log("与当前 Factory 一致:", boundFactory.toLowerCase() === FACTORY_ADDRESS.toLowerCase() ? "是" : "否");
      console.log("Review 门控 (reviewGate):", reviewGate === zeroAddr ? "未设置 (0x0)" : reviewGate);
      if (STAKING_ADDRESS && reviewGate !== zeroAddr) {
        console.log("与当前 ReviewStaking 一致:", reviewGate.toLowerCase() === STAKING_ADDRESS.toLowerCase() ? "是" : "否");
      }
    }
  } else {
    console.log("\n(未配置 ACTIVITY_COMMENTS_ADDRESS，跳过评论合约检查)");
  }

  console.log("--- 检查完成 ---\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
