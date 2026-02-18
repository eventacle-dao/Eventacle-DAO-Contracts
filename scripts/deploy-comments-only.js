/**
 * 仅部署 ActivityComments：从 deployments/<network>.json 读取 factory 与 reviewStaking，
 * 部署 ActivityComments(factory, reviewGate) 后写回 JSON。
 *
 * 用法：
 *   DEPLOY_NETWORK=inj_testnet bunx hardhat run scripts/deploy-comments-only.js
 *   DEPLOY_NETWORK=inj_mainnet bunx hardhat run scripts/deploy-comments-only.js
 * 或：bun run deploy:comments-only:testnet / deploy:comments-only:mainnet
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { default: hre } = await import("hardhat");
const { viem } = await hre.network.connect();

const FALLBACK_GAS_LIMIT_COMMENTS = 3_000_000n;
const GAS_BUFFER_PERCENT = 120n;
const GAS_PRICE = 160_000_000n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function getNetworkFromEnv() {
  const raw = (process.env.DEPLOY_NETWORK || process.env.NETWORK || "").trim().toLowerCase();
  if (raw === "testnet" || raw === "inj_testnet") return "inj_testnet";
  if (raw === "mainnet" || raw === "inj_mainnet") return "inj_mainnet";
  if (["inj_testnet", "inj_mainnet"].includes(raw)) return raw;
  return null;
}

function loadDeployments(network) {
  const path = join(__dirname, "..", "deployments", `${network}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
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
}

async function estimateDeployGas(artifact, args, publicClient, wallet, fallback) {
  try {
    const { encodeDeployData } = await import("viem/utils");
    const bytecode = typeof artifact.bytecode === "string" ? artifact.bytecode : artifact.bytecode?.object;
    const deployData = encodeDeployData({
      abi: artifact.abi,
      bytecode: bytecode?.startsWith("0x") ? bytecode : `0x${bytecode || ""}`,
      args: args ?? [],
    });
    const estimated = await publicClient.estimateGas({
      account: wallet.account,
      data: deployData,
      value: 0n,
      gasPrice: GAS_PRICE,
    });
    return (estimated * GAS_BUFFER_PERCENT) / 100n;
  } catch (e) {
    return fallback;
  }
}

function askConfirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y|yes$/i.test(answer.trim()));
    });
  });
}

async function main() {
  const chosen = getNetworkFromEnv();
  if (!chosen) {
    console.error("请设置环境变量 DEPLOY_NETWORK=inj_testnet 或 DEPLOY_NETWORK=inj_mainnet");
    process.exit(1);
  }
  const isChild = process.env.__DEPLOY_COMMENTS_ONLY_REEXEC === "1";
  if (!isChild && hre.network?.name !== chosen) {
    console.log("切换网络:", chosen);
    execSync(`bunx hardhat run scripts/deploy-comments-only.js --network ${chosen}`, {
      stdio: "inherit",
      cwd: join(__dirname, ".."),
      env: { ...process.env, DEPLOY_NETWORK: chosen, __DEPLOY_COMMENTS_ONLY_REEXEC: "1" },
    });
    process.exit(0);
  }

  const network = hre.network?.name || chosen;
  const deployment = loadDeployments(network);
  if (!deployment?.factory) {
    console.error("未找到 deployments/" + network + ".json 或其中无 factory 地址，请先运行完整部署。");
    process.exit(1);
  }

  const factoryAddress = deployment.factory;
  const reviewGateAddress = deployment.reviewStaking || ZERO_ADDRESS;

  console.log("\n--- 仅部署 ActivityComments ---");
  console.log("网络:", network);
  console.log("Factory:", factoryAddress);
  console.log("ReviewGate:", reviewGateAddress === ZERO_ADDRESS ? "(无)" : reviewGateAddress);

  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();

  const commentsArtifact = await hre.artifacts.readArtifact("ActivityComments");
  const gasLimitComments = await estimateDeployGas(
    commentsArtifact,
    [factoryAddress, reviewGateAddress],
    publicClient,
    wallet,
    FALLBACK_GAS_LIMIT_COMMENTS,
  );
  const costCommentsINJ = Number(gasLimitComments * GAS_PRICE) / 1e18;
  console.log("预估 gas 费用（上限）:", costCommentsINJ.toFixed(6), "INJ\n");

  const confirmed = await askConfirm("确认部署 ActivityComments? (y/n): ");
  if (!confirmed) {
    console.log("已取消。");
    return;
  }

  const activityComments = await viem.deployContract(
    "ActivityComments",
    [factoryAddress, reviewGateAddress],
    { gasPrice: GAS_PRICE, gas: gasLimitComments },
  );
  console.log("ActivityComments 已部署:", activityComments.address);

  deployment.comments = activityComments.address;
  deployment.constructorArgs = deployment.constructorArgs || {};
  deployment.constructorArgs.comments = [factoryAddress, reviewGateAddress];
  if (!deployment.deployedAt) deployment.deployedAt = new Date().toISOString();

  saveDeployments(network, deployment);

  console.log("\n--- 结果 ---");
  console.log("ACTIVITY_COMMENTS_ADDRESS=" + activityComments.address);
  console.log("---\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
