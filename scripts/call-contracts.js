/**
 * 调用 ActivityFactory / ActivityPOAP / ActivityComments 合约（通过环境变量传参）
 *
 * 环境变量：
 *   ACTIVITY_FACTORY_ADDRESS    工厂合约地址（可选，未设则从 deployments/<network>.json 的 factory 读取）
 *   ACTIVITY_COMMENTS_ADDRESS   评论合约地址（可选，未设则从 deployments/<network>.json 的 comments 读取；comment/reply/comments-list 需要）
 *   ACTIVITY_GAS_LIMIT          写操作 gas 上限（可选，未设则按估算值×130% 自动设置）
 *   ACTIVITY_GAS_PRICE          gas 单价（可选，默认 160000000）
 *   ACTIVITY_SKIP_CONFIRM=1     跳过执行前确认（脚本/CI 用）
 *   ACTIVITY_CMD                命令（见下）
 *
 * 命令与参数：
 *   create       创建活动。ACTIVITY_NAME, ACTIVITY_SYMBOL [, ACTIVITY_METADATA_URI]
 *   list         列出所有活动
 *   info         活动详情。ACTIVITY_ID
 *   mint         铸造 POAP。ACTIVITY_ID, ACTIVITY_TO
 *   addMinter    添加铸造者。ACTIVITY_ID, ACTIVITY_MINTER
 *   removeMinter 移除铸造者。ACTIVITY_ID, ACTIVITY_MINTER
 *   comment      发评论（需持 POAP）。ACTIVITY_ID, ACTIVITY_CONTENT_URI
 *   reply        发回复（需持 POAP）。ACTIVITY_ID, ACTIVITY_REPLY_TO_INDEX, ACTIVITY_CONTENT_URI [, ACTIVITY_REVIEW_URI]
 *   comments-list 列出某活动评论。ACTIVITY_ID
 *
 * 示例：
 *   ACTIVITY_CMD=create ACTIVITY_NAME="Hackathon 2026" ACTIVITY_SYMBOL="H26" ACTIVITY_METADATA_URI="ipfs://..." bunx hardhat run scripts/call-contracts.js --network inj_testnet
 *   ACTIVITY_CMD=list bunx hardhat run scripts/call-contracts.js --network inj_testnet
 *   ACTIVITY_CMD=info ACTIVITY_ID=activity-1 bunx hardhat run scripts/call-contracts.js --network inj_testnet
 *   ACTIVITY_CMD=mint ACTIVITY_ID=activity-1 ACTIVITY_TO=0x... bunx hardhat run scripts/call-contracts.js --network inj_testnet
 *   ACTIVITY_CMD=comment ACTIVITY_ID=activity-1 ACTIVITY_CONTENT_URI=ipfs://Qm... bunx hardhat run scripts/call-contracts.js --network inj_testnet
 *   ACTIVITY_CMD=reply ACTIVITY_ID=activity-1 ACTIVITY_REPLY_TO_INDEX=0 ACTIVITY_CONTENT_URI=ipfs://Qm... bunx hardhat run scripts/call-contracts.js --network inj_testnet
 *   ACTIVITY_CMD=comments-list ACTIVITY_ID=activity-1 bunx hardhat run scripts/call-contracts.js --network inj_testnet
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { default: hre } = await import("hardhat");
const { viem } = await hre.network.connect();

const network = hre.network?.name || "unknown";
function loadDeployments() {
  try {
    const path = join(__dirname, "..", "deployments", `${network}.json`);
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  } catch {}
  return null;
}
const deployment = loadDeployments();
const FACTORY_ADDRESS = process.env.ACTIVITY_FACTORY_ADDRESS || deployment?.factory || "";
const COMMENTS_ADDRESS = process.env.ACTIVITY_COMMENTS_ADDRESS || deployment?.comments || "";

const DEFAULT_GAS_PRICE = 160_000_000n;
const GAS_BUFFER_PERCENT = 130n; // 估算值的 130%

/** 为写操作生成 tx 参数：优先用环境变量 ACTIVITY_GAS_LIMIT / ACTIVITY_GAS_PRICE，否则自动估算 gas 并加缓冲 */
async function getWriteTxOpts(publicClient, account, contract, functionName, args) {
  const gasPrice = process.env.ACTIVITY_GAS_PRICE ? BigInt(process.env.ACTIVITY_GAS_PRICE) : DEFAULT_GAS_PRICE;
  if (process.env.ACTIVITY_GAS_LIMIT) {
    return { gasPrice, gas: BigInt(process.env.ACTIVITY_GAS_LIMIT) };
  }
  const estimated = await publicClient.estimateContractGas({
    address: contract.address,
    abi: contract.abi,
    functionName,
    args,
    account,
  });
  const gas = (estimated * GAS_BUFFER_PERCENT) / 100n;
  return { gasPrice, gas };
}

const CONFIRM_WAIT_MS = 2000;   // 交易确认后等待链上状态同步
const CONFIRM_RETRIES = 10;     // create 最多重试次数
const CONFIRM_RETRY_MS = 1500;  // 每次重试间隔（毫秒）
const TX_CONFIRM_RETRIES = 5;   // 其他写操作读回状态的重试次数
const TX_CONFIRM_RETRY_MS = 1000;

const INJ_DECIMALS = 18;

/** 根据 gas、gasPrice 计算并格式化为「预估 gas / 预估 INJ」文案 */
function formatGasAndInj(opts) {
  const costWei = opts.gas * opts.gasPrice;
  const inj = Number(costWei) / 10 ** INJ_DECIMALS;
  return `预估 gas: ${opts.gas.toString()} | 预估 INJ: ${inj.toFixed(6)}`;
}

/** 操作前确认，可展示预估 gas 与 INJ。设 ACTIVITY_SKIP_CONFIRM=1 或 ACTIVITY_CONFIRM=0 可跳过（脚本/CI） */
async function askConfirm(prompt, txOpts = null) {
  if (process.env.ACTIVITY_SKIP_CONFIRM === "1" || process.env.ACTIVITY_CONFIRM === "0") return true;
  const gasInj = txOpts ? " | " + formatGasAndInj(txOpts) : "";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt + gasInj + " 确认执行? [y/N] ", (answer) => {
      rl.close();
      resolve(/^y|yes$/i.test(answer?.trim() ?? ""));
    });
  });
}

async function waitTxThenConfirm(publicClient, txHash, label = "交易") {
  console.log(label + "已发送, hash:", txHash, "等待确认...");
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  await new Promise((r) => setTimeout(r, CONFIRM_WAIT_MS));
}

function printHelp() {
  console.log("环境变量：ACTIVITY_FACTORY_ADDRESS、ACTIVITY_COMMENTS_ADDRESS 可选，未设则从 deployments/<network>.json 读取");
  console.log("ACTIVITY_CMD = create | list | info | mint | addMinter | removeMinter | comment | reply | comments-list");
  console.log("工厂地址:", FACTORY_ADDRESS || "(未设置，请部署或设 ACTIVITY_FACTORY_ADDRESS)");
  console.log("评论合约:", COMMENTS_ADDRESS || "(未设置，comment/reply/comments-list 需要部署 ActivityComments 并写入 deployments)");
  console.log("");
  console.log("示例:");
  console.log('  ACTIVITY_CMD=create ACTIVITY_NAME="Hackathon 2026" ACTIVITY_SYMBOL="H26" ACTIVITY_METADATA_URI="ipfs://..." bunx hardhat run scripts/call-contracts.js --network inj_testnet');
  console.log("  ACTIVITY_CMD=list bunx hardhat run scripts/call-contracts.js --network inj_testnet");
  console.log("  ACTIVITY_CMD=info ACTIVITY_ID=activity-1 bunx hardhat run scripts/call-contracts.js --network inj_testnet");
  console.log("  ACTIVITY_CMD=mint ACTIVITY_ID=activity-1 ACTIVITY_TO=0x... bunx hardhat run scripts/call-contracts.js --network inj_testnet");
  console.log("  ACTIVITY_CMD=comment ACTIVITY_ID=activity-1 ACTIVITY_CONTENT_URI=ipfs://Qm... bunx hardhat run scripts/call-contracts.js --network inj_testnet");
  console.log("  ACTIVITY_CMD=reply ACTIVITY_ID=activity-1 ACTIVITY_REPLY_TO_INDEX=0 ACTIVITY_CONTENT_URI=ipfs://Qm... bunx hardhat run scripts/call-contracts.js --network inj_testnet");
  console.log("  ACTIVITY_CMD=comments-list ACTIVITY_ID=activity-1 bunx hardhat run scripts/call-contracts.js --network inj_testnet");
}

async function main() {
  const cmd = process.env.ACTIVITY_CMD;
  const activityId = process.env.ACTIVITY_ID;
  const toAddress = process.env.ACTIVITY_TO;
  const minterAddress = process.env.ACTIVITY_MINTER;
  const name = process.env.ACTIVITY_NAME;
  const symbol = process.env.ACTIVITY_SYMBOL;
  const metadataURI = process.env.ACTIVITY_METADATA_URI ?? "";
  const contentURI = process.env.ACTIVITY_CONTENT_URI ?? "";
  const reviewURI = process.env.ACTIVITY_REVIEW_URI ?? "";
  const replyToIndexStr = process.env.ACTIVITY_REPLY_TO_INDEX;
  const isVisible = process.env.ACTIVITY_VISIBLE !== "0" && process.env.ACTIVITY_VISIBLE !== "false";

  const [wallet] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const account = wallet?.account;
  if (!account && (cmd === "create" || cmd === "mint" || cmd === "addMinter" || cmd === "removeMinter" || cmd === "comment" || cmd === "reply")) {
    console.log("需要钱包账户（请配置 --network 的私钥）");
    return;
  }
  const factory = await viem.getContractAt("ActivityFactory", FACTORY_ADDRESS);

  switch (cmd) {
    case "create": {
      if (!name || !symbol) {
        console.log("create 需设置 ACTIVITY_NAME, ACTIVITY_SYMBOL, 可选 ACTIVITY_METADATA_URI");
        return;
      }
      console.log("创建活动:", { name, symbol, metadataURI: metadataURI || "(空)" });
      const createOpts = await getWriteTxOpts(publicClient, account, factory, "createActivity", [name, symbol, metadataURI || ""]);
      if (!(await askConfirm("即将创建活动 " + name + " (" + symbol + ")", createOpts))) {
        console.log("已取消");
        return;
      }
      const createTxHash = await factory.write.createActivity([name, symbol, metadataURI || ""], createOpts);
      console.log("交易已发送, hash:", createTxHash, "等待确认...");
      await publicClient.waitForTransactionReceipt({ hash: createTxHash });
      await new Promise((r) => setTimeout(r, CONFIRM_WAIT_MS));

      let newActivityId;
      let poapAddress;
      for (let i = 0; i < CONFIRM_RETRIES; i++) {
        const activityIds = await factory.read.getAllActivityIds();
        newActivityId = activityIds[activityIds.length - 1];
        if (newActivityId) {
          poapAddress = await factory.read.getPOAPContract([newActivityId]);
          if (poapAddress && poapAddress !== "0x0000000000000000000000000000000000000000") {
            break;
          }
        }
        if (i < CONFIRM_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, CONFIRM_RETRY_MS));
        }
      }
      console.log("已创建 activityId:", newActivityId ?? "(未读到)", "| POAP 地址:", poapAddress ?? "(未读到)");
      if (!newActivityId || !poapAddress || poapAddress === "0x0000000000000000000000000000000000000000") {
        console.log("提示: 链上状态可能尚未同步，请稍后使用 ACTIVITY_CMD=list 查看");
      }
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
      const poapName = await poap.read.name();
      const poapSymbol = await poap.read.symbol();
      const totalSupply = await poap.read.totalSupply();
      console.log("活动:", activityId);
      console.log("  POAP 地址:", poapAddress);
      console.log("  名称:", poapName, "| 符号:", poapSymbol);
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
      const mintOpts = await getWriteTxOpts(publicClient, account, poap, "mint", [toAddress]);
      if (!(await askConfirm("即将为 " + activityId + " 铸造 POAP 至 " + toAddress, mintOpts))) {
        console.log("已取消");
        return;
      }
      const txHash = await poap.write.mint([toAddress], mintOpts);
      await waitTxThenConfirm(publicClient, txHash, "铸造");
      let totalSupply;
      for (let i = 0; i < TX_CONFIRM_RETRIES; i++) {
        totalSupply = await poap.read.totalSupply();
        if (i > 0) await new Promise((r) => setTimeout(r, TX_CONFIRM_RETRY_MS));
      }
      console.log("铸造成功, 当前 totalSupply:", totalSupply?.toString() ?? "(未读到)");
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
      const addOpts = await getWriteTxOpts(publicClient, account, poap, "addMinter", [minterAddress]);
      if (!(await askConfirm("即将为 " + activityId + " 添加 minter " + minterAddress, addOpts))) {
        console.log("已取消");
        return;
      }
      const addTxHash = await poap.write.addMinter([minterAddress], addOpts);
      await waitTxThenConfirm(publicClient, addTxHash, "addMinter");
      let added = false;
      for (let i = 0; i < TX_CONFIRM_RETRIES; i++) {
        added = await poap.read.minters([minterAddress]);
        if (added) break;
        await new Promise((r) => setTimeout(r, TX_CONFIRM_RETRY_MS));
      }
      console.log("已添加 minter:", minterAddress, added ? "| 链上已生效" : "| 请稍后用 info 确认");
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
      const removeOpts = await getWriteTxOpts(publicClient, account, poap, "removeMinter", [minterAddress]);
      if (!(await askConfirm("即将为 " + activityId + " 移除 minter " + minterAddress, removeOpts))) {
        console.log("已取消");
        return;
      }
      const removeTxHash = await poap.write.removeMinter([minterAddress], removeOpts);
      await waitTxThenConfirm(publicClient, removeTxHash, "removeMinter");
      let removed = true;
      for (let i = 0; i < TX_CONFIRM_RETRIES; i++) {
        const stillMinter = await poap.read.minters([minterAddress]);
        if (!stillMinter) {
          removed = true;
          break;
        }
        removed = false;
        await new Promise((r) => setTimeout(r, TX_CONFIRM_RETRY_MS));
      }
      console.log("已移除 minter:", minterAddress, removed ? "| 链上已生效" : "| 请稍后用 info 确认");
      break;
    }

    case "comment": {
      if (!COMMENTS_ADDRESS) {
        console.log("comment 需要评论合约地址：设置 ACTIVITY_COMMENTS_ADDRESS，或用 deploy 部署 ActivityComments 后由 deployments/" + network + ".json 自动读取");
        return;
      }
      if (!activityId || !contentURI) {
        console.log("comment 需设置 ACTIVITY_ID, ACTIVITY_CONTENT_URI（调用者须持有该活动 POAP）");
        return;
      }
      const comments = await viem.getContractAt("ActivityComments", COMMENTS_ADDRESS);
      const commentOpts = await getWriteTxOpts(publicClient, account, comments, "postComment", [activityId, contentURI]);
      if (!(await askConfirm("即将在 " + activityId + " 下发评论 " + contentURI, commentOpts))) {
        console.log("已取消");
        return;
      }
      const commentTxHash = await comments.write.postComment([activityId, contentURI], commentOpts);
      await waitTxThenConfirm(publicClient, commentTxHash, "评论");
      let count;
      for (let i = 0; i < TX_CONFIRM_RETRIES; i++) {
        count = await comments.read.getCommentCount([activityId]);
        if (i > 0) await new Promise((r) => setTimeout(r, TX_CONFIRM_RETRY_MS));
      }
      console.log("评论已发布, 当前评论数:", count?.toString() ?? "(未读到)");
      break;
    }

    case "reply": {
      if (!COMMENTS_ADDRESS) {
        console.log("reply 需要评论合约地址：设置 ACTIVITY_COMMENTS_ADDRESS，或用 deploy 部署 ActivityComments 后由 deployments/" + network + ".json 自动读取");
        return;
      }
      if (!activityId || replyToIndexStr === undefined || replyToIndexStr === "" || !contentURI) {
        console.log("reply 需设置 ACTIVITY_ID, ACTIVITY_REPLY_TO_INDEX, ACTIVITY_CONTENT_URI；可选 ACTIVITY_REVIEW_URI");
        return;
      }
      const replyToIndex = BigInt(replyToIndexStr);
      const comments = await viem.getContractAt("ActivityComments", COMMENTS_ADDRESS);
      const replyOpts = await getWriteTxOpts(publicClient, account, comments, "postReply", [activityId, replyToIndex, contentURI, reviewURI]);
      if (!(await askConfirm("即将在 " + activityId + " 下回复 #" + replyToIndexStr + " " + contentURI, replyOpts))) {
        console.log("已取消");
        return;
      }
      const replyTxHash = await comments.write.postReply([activityId, replyToIndex, contentURI, reviewURI], replyOpts);
      await waitTxThenConfirm(publicClient, replyTxHash, "回复");
      let replyCount;
      for (let i = 0; i < TX_CONFIRM_RETRIES; i++) {
        replyCount = await comments.read.getCommentCount([activityId]);
        if (i > 0) await new Promise((r) => setTimeout(r, TX_CONFIRM_RETRY_MS));
      }
      console.log("回复已发布, 当前评论数:", replyCount?.toString() ?? "(未读到)");
      break;
    }

    case "comments-list": {
      if (!COMMENTS_ADDRESS) {
        console.log("comments-list 需要评论合约地址：设置 ACTIVITY_COMMENTS_ADDRESS，或用 deploy 部署 ActivityComments 后由 deployments/" + network + ".json 自动读取");
        return;
      }
      if (!activityId) {
        console.log("comments-list 需设置 ACTIVITY_ID");
        return;
      }
      const comments = await viem.getContractAt("ActivityComments", COMMENTS_ADDRESS);
      const count = await comments.read.getCommentCount([activityId]);
      console.log("活动", activityId, "评论数:", count.toString());
      if (count === 0n) {
        console.log("(无评论)");
        break;
      }
      const list = await comments.read.getComments([activityId]);
      const noParent = await comments.read.NO_PARENT();
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const replyTo = c.replyToIndex === noParent ? "根评论" : "回复#" + c.replyToIndex.toString();
        console.log(`  [${i}] ${c.commenter} | ${replyTo} | 展示:${c.isVisible} | ${c.contentURI}${c.reviewURI ? " | " + c.reviewURI : ""} | ts:${c.timestamp}`);
      }
      break;
    }

    default:
      printHelp();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
