const { default: hre } = await import("hardhat");
const { viem } = await hre.network.connect();

const ACTIVITY_FACTORY_ADDRESS = "0x868c2995d4eeace5f031333aba86651f0f63092e";

async function main() {
  const publicClient = await viem.getPublicClient();
  const code = await publicClient.getBytecode({ address: ACTIVITY_FACTORY_ADDRESS });

  console.log("--- ActivityFactory 链上检查 ---");
  console.log("合约地址:", ACTIVITY_FACTORY_ADDRESS);
  console.log("链上是否有代码:", code && code.length > 2 ? "是" : "否");

  if (!code || code.length <= 2) {
    console.log("该地址无合约代码，可能未部署或地址错误。");
    return;
  }

  const factory = await viem.getContractAt("ActivityFactory", ACTIVITY_FACTORY_ADDRESS);
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
  console.log("--- 检查完成 ---");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
