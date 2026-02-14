/**
 * 调用 ActivityFactory / ActivityPOAP 合约（通过环境变量传参，避免被 Hardhat 消费）
 *
 * 环境变量：
 *   ACTIVITY_FACTORY_ADDRESS  工厂合约地址（可选，有默认值）
 *   ACTIVITY_CMD              命令：create | list | info | mint | addMinter | removeMinter
 *   create 时：ACTIVITY_NAME, ACTIVITY_SYMBOL, ACTIVITY_METADATA_URI
 *   info/mint/addMinter/removeMinter 时：ACTIVITY_ID
 *   mint 时：ACTIVITY_TO（接收地址）
 *   addMinter/removeMinter 时：ACTIVITY_MINTER（minter 地址）
 *
 * 示例：
 *   ACTIVITY_CMD=create ACTIVITY_NAME="Hackathon 2026" ACTIVITY_SYMBOL="H26" ACTIVITY_METADATA_URI="ipfs://Qm..." bunx hardhat run scripts/call-contracts.js --network inj_testnet
 *   ACTIVITY_CMD=list bunx hardhat run scripts/call-contracts.js --network inj_testnet
 *   ACTIVITY_CMD=info ACTIVITY_ID=activity-1 bunx hardhat run scripts/call-contracts.js --network inj_testnet
 *   ACTIVITY_CMD=mint ACTIVITY_ID=activity-1 ACTIVITY_TO=0x... bunx hardhat run scripts/call-contracts.js --network inj_testnet
 */

const { default: hre } = await import("hardhat");
const { viem } = await hre.network.connect();

const FACTORY_ADDRESS = process.env.ACTIVITY_FACTORY_ADDRESS || "0x868c2995d4eeace5f031333aba86651f0f63092e";

// Injective 等链需显式指定 gas/gasPrice，否则报 insufficient fee
const TX_OPTS = {
  gasPrice: 160_000_000n,
  gas: 3_500_000n, // createActivity 会部署合约，需要较高 gas；mint/addMinter/removeMinter 实际用不完
};

async function main() {
  const cmd = process.env.ACTIVITY_CMD;
  const activityId = process.env.ACTIVITY_ID;
  const toAddress = process.env.ACTIVITY_TO;
  const minterAddress = process.env.ACTIVITY_MINTER;
  const name = process.env.ACTIVITY_NAME;
  const symbol = process.env.ACTIVITY_SYMBOL;
  const metadataURI = process.env.ACTIVITY_METADATA_URI ?? "";

  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  const factory = await viem.getContractAt("ActivityFactory", FACTORY_ADDRESS);

  switch (cmd) {
    case "create": {
      if (!name || !symbol) {
        console.log("create 需设置 ACTIVITY_NAME, ACTIVITY_SYMBOL, 可选 ACTIVITY_METADATA_URI");
        return;
      }
      console.log("创建活动:", { name, symbol, metadataURI: metadataURI || "(空)" });
      await factory.write.createActivity([name, symbol, metadataURI || ""], TX_OPTS);
      const activityIds = await factory.read.getAllActivityIds();
      const activityId = activityIds[activityIds.length - 1];
      const poapAddress = await factory.read.getPOAPContract([activityId]);
      console.log("已创建 activityId:", activityId, "| POAP 地址:", poapAddress);
      break;
    }

    case "list": {
      const activityIds = await factory.read.getAllActivityIds();
      console.log("活动数量:", activityIds.length);
      for (const id of activityIds) {
        const poapAddr = await factory.read.getPOAPContract([id]);
        const creator = await factory.read.getActivityCreator([id]);
        const createdAt = await factory.read.getActivityCreatedAt([id]);
        console.log(" -", id, "| POAP:", poapAddr, "| 创建者:", creator, "| 创建时间:", createdAt.toString());
      }
      break;
    }

    case "info": {
      if (!activityId) {
        console.log("info 需设置 ACTIVITY_ID");
        return;
      }
      const poapAddress = await factory.read.getPOAPContract([activityId]);
      if (!poapAddress || poapAddress === "0x0000000000000000000000000000000000000000") {
        console.log("活动不存在:", activityId);
        return;
      }
      const creator = await factory.read.getActivityCreator([activityId]);
      const createdAt = await factory.read.getActivityCreatedAt([activityId]);
      const poap = await viem.getContractAt("ActivityPOAP", poapAddress);
      const name = await poap.read.name();
      const symbol = await poap.read.symbol();
      const totalSupply = await poap.read.totalSupply();
      console.log("活动:", activityId);
      console.log("  POAP 地址:", poapAddress);
      console.log("  名称:", name, "| 符号:", symbol);
      console.log("  创建者:", creator, "| 创建时间:", createdAt.toString());
      console.log("  已铸造数量:", totalSupply.toString());
      break;
    }

    case "mint": {
      if (!activityId || !toAddress) {
        console.log("mint 需设置 ACTIVITY_ID, ACTIVITY_TO");
        return;
      }
      const poapAddress = await factory.read.getPOAPContract([activityId]);
      if (!poapAddress || poapAddress === "0x0000000000000000000000000000000000000000") {
        console.log("活动不存在:", activityId);
        return;
      }
      const poap = await viem.getContractAt("ActivityPOAP", poapAddress);
      const tx = await poap.write.mint([toAddress], TX_OPTS);
      console.log("铸造成功, tx:", tx);
      const totalSupply = await poap.read.totalSupply();
      console.log("当前 totalSupply:", totalSupply.toString());
      break;
    }

    case "addMinter": {
      if (!activityId || !minterAddress) {
        console.log("addMinter 需设置 ACTIVITY_ID, ACTIVITY_MINTER");
        return;
      }
      const poapAddress = await factory.read.getPOAPContract([activityId]);
      if (!poapAddress || poapAddress === "0x0000000000000000000000000000000000000000") {
        console.log("活动不存在:", activityId);
        return;
      }
      const poap = await viem.getContractAt("ActivityPOAP", poapAddress);
      await poap.write.addMinter([minterAddress], TX_OPTS);
      console.log("已添加 minter:", minterAddress);
      break;
    }

    case "removeMinter": {
      if (!activityId || !minterAddress) {
        console.log("removeMinter 需设置 ACTIVITY_ID, ACTIVITY_MINTER");
        return;
      }
      const poapAddress = await factory.read.getPOAPContract([activityId]);
      if (!poapAddress || poapAddress === "0x0000000000000000000000000000000000000000") {
        console.log("活动不存在:", activityId);
        return;
      }
      const poap = await viem.getContractAt("ActivityPOAP", poapAddress);
      await poap.write.removeMinter([minterAddress], TX_OPTS);
      console.log("已移除 minter:", minterAddress);
      break;
    }

    default:
      console.log("请设置环境变量 ACTIVITY_CMD = create | list | info | mint | addMinter | removeMinter");
      console.log("工厂地址:", FACTORY_ADDRESS);
      console.log("示例:");
      console.log('  ACTIVITY_CMD=create ACTIVITY_NAME="Hackathon 2026" ACTIVITY_SYMBOL="H26" ACTIVITY_METADATA_URI="ipfs://..." bunx hardhat run scripts/call-contracts.js --network inj_testnet');
      console.log("  ACTIVITY_CMD=list bunx hardhat run scripts/call-contracts.js --network inj_testnet");
      console.log("  ACTIVITY_CMD=info ACTIVITY_ID=activity-1 bunx hardhat run scripts/call-contracts.js --network inj_testnet");
      console.log("  ACTIVITY_CMD=mint ACTIVITY_ID=activity-1 ACTIVITY_TO=0x... bunx hardhat run scripts/call-contracts.js --network inj_testnet");
      console.log("  ACTIVITY_CMD=addMinter ACTIVITY_ID=activity-1 ACTIVITY_MINTER=0x... bunx hardhat run scripts/call-contracts.js --network inj_testnet");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
