/**
 * 使用 bunx hardhat verify 验证已部署合约。
 * 地址与构造参数来源：环境变量或 deployments/<network>.json（部署时写入的 constructorArgs）。
 *
 * 用法：
 *   DEPLOY_NETWORK=inj_testnet bunx hardhat run scripts/verify.js
 *   DEPLOY_NETWORK=inj_mainnet bunx hardhat run scripts/verify.js
 * 可选：只验证指定合约
 *   DEPLOY_NETWORK=inj_testnet CONTRACT=ActivityFactory bunx hardhat run scripts/verify.js
 *   CONTRACT=ReviewStaking | ActivityComments
 * 可选：强制重新提交验证（当 Blockscout 显示“未验证但找到相同 bytecode”时使用）
 *   VERIFY_FORCE=1 bun run verify:testnet
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getNetworkFromEnv() {
  const raw = (process.env.DEPLOY_NETWORK || process.env.NETWORK || "").trim().toLowerCase();
  if (raw === "testnet" || raw === "inj_testnet") return "inj_testnet";
  if (raw === "mainnet" || raw === "inj_mainnet") return "inj_mainnet";
  if (["inj_testnet", "inj_mainnet"].includes(raw)) return raw;
  return null;
}

function loadDeployments(network) {
  try {
    const path = join(__dirname, "..", "deployments", `${network}.json`);
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  } catch {}
  return null;
}

function runVerify(network, contractName, address, constructorArgs = [], force = false) {
  const args = ["hardhat", "verify", "--network", network, ...(force ? ["--force"] : []), address, ...constructorArgs];
  console.log("[verify]", contractName, "| bunx", args.join(" "));
  const result = spawnSync("bunx", args, {
    cwd: join(__dirname, ".."),
    env: process.env,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  const out = (result.stdout || "") + (result.stderr || "");
  const blockscoutOk = /already been verified on Blockscout|verified on Blockscout|successfully verified|contract source code already verified/i.test(out);
  const isSuccess = result.status === 0 || blockscoutOk;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (isSuccess) {
    console.log("[verify]", contractName, "成功\n");
    return true;
  }
  console.error("[verify]", contractName, "失败", result.status != null ? "(exit " + result.status + ")" : "", "\n");
  return false;
}

async function main() {
  const network = getNetworkFromEnv();
  if (!network) {
    console.error("请设置环境变量 DEPLOY_NETWORK=inj_testnet 或 DEPLOY_NETWORK=inj_mainnet");
    process.exit(1);
  }

  const deployment = loadDeployments(network);
  if (!deployment?.factory) {
    console.error("未找到 deployments/" + network + ".json 或其中无 factory 地址，请先部署。");
    process.exit(1);
  }

  const onlyContract = (process.env.CONTRACT || "").trim();
  const force = /^1|true|yes$/i.test((process.env.VERIFY_FORCE || "").trim());
  if (force) console.log("[verify] 使用 --force 强制提交验证\n");
  const constructorArgs = deployment.constructorArgs || {};
  let ok = 0;
  let fail = 0;

  // ActivityFactory：无构造参数
  if (!onlyContract || onlyContract === "ActivityFactory") {
    const success = runVerify(network, "ActivityFactory", deployment.factory, [], force);
    if (success) ok++; else fail++;
  }

  // ReviewStaking：(owner, requiredStake)
  if (deployment.reviewStaking && (!onlyContract || onlyContract === "ReviewStaking")) {
    const args = constructorArgs.reviewStaking;
    if (!args || args.length < 2) {
      console.warn("[verify] ReviewStaking 缺少 constructorArgs.reviewStaking，跳过。请用完整参数手动执行：");
      console.warn("  bunx hardhat verify --network", network, deployment.reviewStaking, "<owner>", "<requiredStakeWei>");
      fail++;
    } else {
      const success = runVerify(network, "ReviewStaking", deployment.reviewStaking, args, force);
      if (success) ok++; else fail++;
    }
  } else if (onlyContract === "ReviewStaking" && !deployment.reviewStaking) {
    console.warn("[verify] 未部署 ReviewStaking，跳过。");
  }

  // ActivityComments：(factory, reviewGate)
  if (deployment.comments && (!onlyContract || onlyContract === "ActivityComments")) {
    const args = constructorArgs.comments;
    if (!args || args.length < 2) {
      console.warn("[verify] ActivityComments 缺少 constructorArgs.comments，使用 factory 与 reviewGate 推断。");
      const factory = deployment.factory;
      const reviewGate = deployment.reviewStaking || "0x0000000000000000000000000000000000000000";
      const success = runVerify(network, "ActivityComments", deployment.comments, [factory, reviewGate], force);
      if (success) ok++; else fail++;
    } else {
      const success = runVerify(network, "ActivityComments", deployment.comments, args, force);
      if (success) ok++; else fail++;
    }
  } else if (onlyContract === "ActivityComments" && !deployment.comments) {
    console.warn("[verify] 未部署 ActivityComments，跳过。");
  }

  console.log("--- 验证结果: 成功", ok, "失败", fail, "---");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
