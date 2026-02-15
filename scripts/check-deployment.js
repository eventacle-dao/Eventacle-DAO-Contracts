/**
 * 检查已部署的 ActivityFactory 与（可选）ActivityComments。
 * 地址来源（优先级）：环境变量 ACTIVITY_FACTORY_ADDRESS / ACTIVITY_COMMENTS_ADDRESS
 * 或 deployments/<network>.json（使用 --network 时的网络名）。
 *
 * 用法：bunx hardhat run scripts/check-deployment.js --network inj_testnet
 * 或：ACTIVITY_FACTORY_ADDRESS=0x... ACTIVITY_COMMENTS_ADDRESS=0x... bunx hardhat run scripts/check-deployment.js --network inj_testnet
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { default: hre } = await import("hardhat");
const { viem } = await hre.network.connect();

function loadDeployments(network) {
  const path = join(__dirname, "..", "deployments", `${network}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const network = hre.network?.name || "unknown";
  let factoryAddress = process.env.ACTIVITY_FACTORY_ADDRESS;
  let commentsAddress = process.env.ACTIVITY_COMMENTS_ADDRESS ?? null;

  if (!factoryAddress) {
    const deployment = loadDeployments(network);
    if (deployment?.factory) {
      factoryAddress = deployment.factory;
      if (deployment.comments) commentsAddress = deployment.comments;
      console.log("已从 deployments/" + network + ".json 读取地址");
    } else {
      factoryAddress = "0x868c2995d4eeace5f031333aba86651f0f63092e";
      console.log("未设置 ACTIVITY_FACTORY_ADDRESS，使用默认工厂地址");
    }
  } else if (!commentsAddress && process.env.ACTIVITY_COMMENTS_ADDRESS === undefined) {
    const deployment = loadDeployments(network);
    if (deployment?.comments) commentsAddress = deployment.comments;
  }

  const publicClient = await viem.getPublicClient();

  console.log("\n--- ActivityFactory 链上检查 ---");
  console.log("合约地址:", factoryAddress);
  const factoryCode = await publicClient.getBytecode({ address: factoryAddress });
  const factoryHasCode = factoryCode && factoryCode.length > 2;
  console.log("链上是否有代码:", factoryHasCode ? "是" : "否");

  if (!factoryHasCode) {
    console.log("该地址无合约代码，可能未部署或地址错误。");
    console.log("--- 检查结束 ---\n");
    return;
  }

  const factory = await viem.getContractAt("ActivityFactory", factoryAddress);
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

  if (commentsAddress) {
    console.log("\n--- ActivityComments 链上检查 ---");
    console.log("合约地址:", commentsAddress);
    const commentsCode = await publicClient.getBytecode({ address: commentsAddress });
    const commentsHasCode = commentsCode && commentsCode.length > 2;
    console.log("链上是否有代码:", commentsHasCode ? "是" : "否");
    if (commentsHasCode) {
      const comments = await viem.getContractAt("ActivityComments", commentsAddress);
      const boundFactory = await comments.read.factory();
      console.log("绑定的 Factory:", boundFactory);
      console.log("与当前 Factory 一致:", boundFactory.toLowerCase() === factoryAddress.toLowerCase() ? "是" : "否");
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
