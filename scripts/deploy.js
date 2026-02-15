/**
 * 部署 ActivityFactory，并可选部署 ActivityComments。
 * 部署结果写入 deployments/<network>.json，便于 check-deployment 与 call-contracts 使用。
 *
 * 用法：bunx hardhat run scripts/deploy.js --network inj_testnet
 * 环境变量：无（PRIVATE_KEY 等由 hardhat 网络配置与 .env 提供）
 */

import { createInterface } from "node:readline";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, appendFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { default: hre } = await import("hardhat");
const { viem } = await hre.network.connect();

const FALLBACK_GAS_LIMIT_FACTORY = 3_500_000n;
const FALLBACK_GAS_LIMIT_COMMENTS = 3_000_000n;  // 评论合约含依赖，需较高 gas
const GAS_BUFFER_PERCENT = 120n;
const GAS_PRICE = 160_000_000n;
const INJ_DECIMALS = 18;

function askConfirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y|yes$/i.test(answer.trim()));
    });
  });
}

function saveDeployments(network, data) {
  const deploymentsDir = join(__dirname, "..", "deployments");
  mkdirSync(deploymentsDir, { recursive: true });
  const path = join(deploymentsDir, `${network}.json`);
  const backupPath = join(deploymentsDir, `${network}.json.bak`);
  try {
    if (existsSync(path)) {
      const oldContent = readFileSync(path, "utf8");
      appendFileSync(backupPath, "\n" + oldContent, "utf8");
    }
  } catch (e) {
    console.error("备份失败:", e);
  }
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
  console.log("已写入:", path);
  if (typeof existsSync === "function" && existsSync(backupPath)) {
    console.log("已追加备份到:", backupPath);
  }
}

async function main() {
  const network = hre.network?.name && hre.network.name !== "hardhat" ? hre.network.name : (process.env.HARDHAT_NETWORK || process.env.NETWORK || "inj_testnet");
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();

  // ---------- 1. 部署 ActivityFactory ----------
  const factoryArtifact = await hre.artifacts.readArtifact("ActivityFactory");
  const factoryBytecode = typeof factoryArtifact.bytecode === "string"
    ? factoryArtifact.bytecode
    : factoryArtifact.bytecode?.object;
  if (!factoryBytecode || factoryBytecode === "0x") {
    throw new Error("ActivityFactory 未编译或无 bytecode");
  }

  let gasLimitFactory = FALLBACK_GAS_LIMIT_FACTORY;
  try {
    const estimated = await publicClient.estimateGas({
      account: wallet.account,
      data: factoryBytecode,
      value: 0n,
      gasPrice: GAS_PRICE,
    });
    gasLimitFactory = (estimated * GAS_BUFFER_PERCENT) / 100n;
    console.log("[Factory] 预估 gas:", estimated.toString(), "| 使用上限:", gasLimitFactory.toString());
  } catch (e) {
    console.log("[Factory] Gas 估算失败，使用固定上限:", gasLimitFactory.toString());
  }

  const costFactoryWei = gasLimitFactory * GAS_PRICE;
  const costFactoryINJ = Number(costFactoryWei) / 10 ** INJ_DECIMALS;
  console.log("[Factory] 预估费用（上限）:", costFactoryINJ.toFixed(6), "INJ");

  const confirmedFactory = await askConfirm("确认部署 ActivityFactory? (y/n): ");
  if (!confirmedFactory) {
    console.log("已取消部署。");
    return;
  }

  const activityFactory = await viem.deployContract("ActivityFactory", [], {
    gasPrice: GAS_PRICE,
    gas: gasLimitFactory,
  });
  console.log("ActivityFactory 已部署:", activityFactory.address);

  const deployment = {
    chainId: (await publicClient.getChainId()).toString(),
    factory: activityFactory.address,
    comments: null,
    deployedAt: new Date().toISOString(),
  };

  // ---------- 2. 可选部署 ActivityComments ----------
  const deployComments = await askConfirm("是否同时部署 ActivityComments（评论合约，依赖本 Factory）? (y/n): ");
  if (deployComments) {
    const commentsArtifact = await hre.artifacts.readArtifact("ActivityComments");
    const commentsBytecode = typeof commentsArtifact.bytecode === "string"
      ? commentsArtifact.bytecode
      : commentsArtifact.bytecode?.object;
    if (!commentsBytecode || commentsBytecode === "0x") {
      throw new Error("ActivityComments 未编译或无 bytecode");
    }

    let gasLimitComments = FALLBACK_GAS_LIMIT_COMMENTS;
    try {
      const { encodeDeployData } = await import("viem/utils");
      const deployData = encodeDeployData({
        abi: commentsArtifact.abi,
        bytecode: commentsBytecode.startsWith("0x") ? commentsBytecode : `0x${commentsBytecode}`,
        args: [activityFactory.address],
      });
      const estimated = await publicClient.estimateGas({
        account: wallet.account,
        data: deployData,
        value: 0n,
        gasPrice: GAS_PRICE,
      });
      gasLimitComments = (estimated * GAS_BUFFER_PERCENT) / 100n;
      console.log("[Comments] 预估 gas:", estimated.toString(), "| 使用上限:", gasLimitComments.toString());
    } catch (e) {
      console.log("[Comments] Gas 估算失败，使用固定上限:", gasLimitComments.toString(), "|", e?.message || e);
    }

    const activityComments = await viem.deployContract("ActivityComments", [activityFactory.address], {
      gasPrice: GAS_PRICE,
      gas: gasLimitComments,
    });
    console.log("ActivityComments 已部署:", activityComments.address);
    deployment.comments = activityComments.address;
  }

  saveDeployments(network, deployment);

  console.log("\n--- 部署结果 ---");
  console.log("ACTIVITY_FACTORY_ADDRESS=" + deployment.factory);
  if (deployment.comments) {
    console.log("ACTIVITY_COMMENTS_ADDRESS=" + deployment.comments);
  }
  console.log("可将以上行加入 .env 或导出后执行 call-contracts.js / check-deployment.js");
  console.log("---");
}

main()
  .then(() => {
    console.log("Deployment script executed successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
