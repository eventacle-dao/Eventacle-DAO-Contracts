const { default: hre } = await import("hardhat");
const { viem } = await hre.network.connect();

async function main() {
  const counter = await viem.deployContract("Counter", [], {
    gasPrice: 160_000_000n,
    gas: 2_000_000n,
  });

  console.log("Counter smart contract deployed to:", counter.address);
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
