/**
 * 从 deployments/inj_testnet.json 读取 factory 地址，创建 50 个已结束的活动（用于测试 getOngoing 等逻辑）。
 *
 * 运行：
 *   DEPLOY_NETWORK=inj_testnet bunx hardhat run scripts/seed-past-activities.js
 * 或指定网络：
 *   bunx hardhat run scripts/seed-past-activities.js --network inj_testnet
 *
 * 环境变量：
 *   DEPLOY_NETWORK       - inj_testnet | inj_mainnet（未设则默认 inj_testnet）
 *   ACTIVITY_FACTORY_ADDRESS - 可选，覆盖 deployments 中的 factory
 *   SEED_COUNT           - 创建数量，默认 1
 *   SEED_SKIP_CONFIRM=1  - 跳过确认直接执行
 *   PRIVATE_KEY          - 调用者私钥（需有 gas）
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { default: hre } = await import("hardhat");
const { viem } = await hre.network.connect();

const DEFAULT_GAS_PRICE = 160_000_000n;
const GAS_BUFFER_PERCENT = 130n;
const DEFAULT_SEED_COUNT = 1;

function getNetworkFromEnv() {
  const raw = (process.env.DEPLOY_NETWORK || process.env.NETWORK || "inj_testnet").trim().toLowerCase();
  if (raw === "testnet" || raw === "inj_testnet") return "inj_testnet";
  if (raw === "mainnet" || raw === "inj_mainnet") return "inj_mainnet";
  if (["inj_testnet", "inj_mainnet"].includes(raw)) return raw;
  return "inj_testnet";
}

const chosen = getNetworkFromEnv();
const isChild = process.env.__SEED_REEXEC === "1";
if (!isChild && hre.network?.name !== chosen) {
  console.log("切换网络:", chosen);
  execSync(`bunx hardhat run scripts/seed-past-activities.js --network ${chosen}`, {
    stdio: "inherit",
    cwd: join(__dirname, ".."),
    env: { ...process.env, __SEED_REEXEC: "1" },
  });
  process.exit(0);
}

const network = hre.network?.name || chosen;

function loadDeployments() {
  try {
    const path = join(__dirname, "..", "deployments", `${network}.json`);
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error("读取 deployments 失败:", e.message);
  }
  return null;
}

const deployment = loadDeployments();
const FACTORY_ADDRESS = process.env.ACTIVITY_FACTORY_ADDRESS || deployment?.factory || "";

if (!FACTORY_ADDRESS) {
  console.error("未找到 factory 地址。请设置 ACTIVITY_FACTORY_ADDRESS 或确保 deployments/" + network + ".json 中有 factory 字段。");
  process.exit(1);
}

async function getWriteTxOpts(publicClient, account, contract, functionName, args) {
  const gasPrice = process.env.ACTIVITY_GAS_PRICE ? BigInt(process.env.ACTIVITY_GAS_PRICE) : DEFAULT_GAS_PRICE;
  try {
    const estimated = await publicClient.estimateContractGas({
      address: contract.address,
      abi: contract.abi,
      functionName,
      args,
      account,
    });
    const gas = (estimated * GAS_BUFFER_PERCENT) / 100n;
    return { gasPrice, gas };
  } catch (e) {
    return { gasPrice, gas: 3_000_000n };
  }
}

function askConfirm(question) {
  if (process.env.SEED_SKIP_CONFIRM === "1") return Promise.resolve(true);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question + " (y/n): ", (answer) => {
      rl.close();
      resolve(/^y|yes$/i.test(answer.trim()));
    });
  });
}

async function main() {
  const count = Math.min(Number(process.env.SEED_COUNT) || DEFAULT_SEED_COUNT, 100);
  console.log("Factory 地址:", FACTORY_ADDRESS);
  console.log("将创建", count, "个已结束的活动（startAt=0, endAt=1）");

  const [wallet] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const account = wallet?.account;
  if (!account) {
    console.error("需要钱包账户，请配置 --network 对应私钥（如 PRIVATE_KEY）");
    process.exit(1);
  }

  const factory = await viem.getContractAt("ActivityFactory", FACTORY_ADDRESS);

  const name = "Past Event";
  const symbol = "PE";
  const metadataURI = "ipfs://bafkreibqcl66vj2vl435m23i2wyqklmcffmkgl2fbu77doq7ps62bpvcee";
  const startAt = 0n;
  const endAt = 1n; // 已结束
  const activityType = 3; // OTHER

  if (!(await askConfirm(`确认在 ${network} 上创建 ${count} 个已结束活动？`))) {
    console.log("已取消");
    return;
  }

  const createArgs = [name, symbol, metadataURI, startAt, endAt, activityType];
  const createOpts = await getWriteTxOpts(publicClient, account, factory, "createActivity", createArgs);

  for (let i = 0; i < count; i++) {
    const txHash = await factory.write.createActivity(createArgs, createOpts);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    if ((i + 1) % 10 === 0 || i === count - 1) {
      console.log("已创建", i + 1, "/", count);
    }
  }

  const activityIds = await factory.read.getAllActivityIds();
  console.log("当前活动总数:", activityIds.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
