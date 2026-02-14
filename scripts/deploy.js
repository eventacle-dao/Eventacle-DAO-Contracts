import { createInterface } from "node:readline";

const { default: hre } = await import("hardhat");
const { viem } = await hre.network.connect();

// 部署 gas 上限：若 RPC 估算失败则使用此值（ActivityFactory + Ownable 约 2.5M–3M，留约 20% 余量）
const FALLBACK_GAS_LIMIT = 3_500_000n;
const GAS_BUFFER_PERCENT = 120n; // 估算值 * 120%
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

async function main() {
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  const artifact = await hre.artifacts.readArtifact("ActivityFactory");
  const bytecode = typeof artifact.bytecode === "string" ? artifact.bytecode : artifact.bytecode?.object;
  if (!bytecode || bytecode === "0x") throw new Error("ActivityFactory 未编译或无 bytecode");

  let gasLimit = FALLBACK_GAS_LIMIT;
  let estimated = null;
  try {
    estimated = await publicClient.estimateGas({
      account: wallet.account,
      data: bytecode,
      value: 0n,
      gasPrice: GAS_PRICE,
    });
    gasLimit = (estimated * GAS_BUFFER_PERCENT) / 100n;
    console.log("预估部署 gas:", estimated.toString(), "| 使用上限:", gasLimit.toString());
  } catch (e) {
    console.log("Gas 估算失败，使用固定上限:", gasLimit.toString());
  }

  const maxCostWei = gasLimit * GAS_PRICE;
  const maxCostINJ = Number(maxCostWei) / 10 ** INJ_DECIMALS;
  console.log("预估费用（上限）:", maxCostINJ.toFixed(6), "INJ");

  const confirmed = await askConfirm("确认部署? (y/n): ");
  if (!confirmed) {
    console.log("已取消部署。（输入 y 或 yes 才会部署）");
    return;
  }

  const activityFactory = await viem.deployContract("ActivityFactory", [], {
    gasPrice: GAS_PRICE,
    gas: gasLimit,
  });

  console.log("ActivityFactory smart contract deployed to:", activityFactory.address);
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
