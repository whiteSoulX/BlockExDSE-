// Deploys BlockExDSE to the local Hardhat node and runs a full order
// lifecycle: KYC verify -> place buy order -> place sell order -> match ->
// settle -> verify hash anchor. Uses the manually-compiled bytecode from
// compile-check.js since the sandbox can't reach the solc binary CDN.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const crypto = require("crypto");

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

  // Hardhat's well-known local test accounts
  const admin = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider); // Account #0
  const buyer = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider); // Account #1
  const seller = new ethers.Wallet("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", provider); // Account #2

  const abi = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts-manual/BlockExDSE.abi.json"), "utf8"));
  const bytecode = "0x" + fs.readFileSync(path.join(__dirname, "../artifacts-manual/BlockExDSE.bytecode.txt"), "utf8");

  console.log("── Step 1: Deploy contract ──────────────────────────────");
  let adminNonce = await provider.getTransactionCount(admin.address, "latest");
  const factory = new ethers.ContractFactory(abi, bytecode, admin);
  const contract = await factory.deploy({ nonce: adminNonce++ });
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log("Deployed BlockExDSE at:", contractAddress);

  console.log("\n── Step 2: KYC-verify buyer and seller ──────────────────");
  await (await contract.verifyParticipant(buyer.address, { nonce: adminNonce++ })).wait();
  await (await contract.verifyParticipant(seller.address, { nonce: adminNonce++ })).wait();
  console.log("Buyer verified:", buyer.address);
  console.log("Seller verified:", seller.address);

  console.log("\n── Step 3: Place a BUY order (edge layer would do this after PBFT-lite validation) ──");
  const contractAsBuyer = contract.connect(buyer);
  const buyTx = await contractAsBuyer.placeOrder("DSEX", 0 /* BUY */, 100, ethers.parseUnits("50", 0));
  const buyReceipt = await buyTx.wait();
  const buyOrderId = buyReceipt.logs[0].args[0];
  console.log("Buy order placed. Order ID:", buyOrderId.toString(), "| 100 shares @ 50 each");

  console.log("\n── Step 4: Place a matching SELL order ──────────────────");
  const contractAsSeller = contract.connect(seller);
  const sellTx = await contractAsSeller.placeOrder("DSEX", 1 /* SELL */, 100, ethers.parseUnits("50", 0));
  const sellReceipt = await sellTx.wait();
  const sellOrderId = sellReceipt.logs[0].args[0];
  console.log("Sell order placed. Order ID:", sellOrderId.toString(), "| 100 shares @ 50 each");

  console.log("\n── Step 5: Delegate records the match (simplified CDA result) ──");
  const matchTx = await contract.recordMatch(buyOrderId, sellOrderId, 50, 100, { nonce: adminNonce++ });
  const matchReceipt = await matchTx.wait();
  const matchId = matchReceipt.logs[0].args[0];
  console.log("Match recorded. Match ID:", matchId.toString());

  console.log("\n── Step 6: Settle the trade with off-chain hash anchor ──");
  // Simulate the off-chain record (D2/D5/D6) that would live in MongoDB
  const offChainRecord = JSON.stringify({ buyOrderId: buyOrderId.toString(), sellOrderId: sellOrderId.toString(), matchedAt: Date.now() });
  const offChainHash = "0x" + crypto.createHash("sha256").update(offChainRecord).digest("hex");
  const settleTx = await contract.settleTrade(matchId, offChainHash, { nonce: adminNonce++ });
  const settleReceipt = await settleTx.wait();
  const settlementId = settleReceipt.logs[0].args[0];
  console.log("Trade settled. Settlement ID:", settlementId.toString());
  console.log("Off-chain hash anchored on-chain:", offChainHash);
  console.log("Real transaction hash:", settleReceipt.hash);

  console.log("\n── Step 7: Verify hash anchor integrity (Parameter P9) ──");
  const isValid = await contract.verifyOffChainHash(settlementId, offChainHash);
  console.log("Hash anchor verified:", isValid ? "✅ PASS" : "❌ FAIL");

  console.log("\n── Step 8: Read back the full settlement record ──────────");
  const settlement = await contract.getSettlement(settlementId);
  console.log({
    id: settlement.id.toString(),
    buyer: settlement.buyer,
    seller: settlement.seller,
    ticker: settlement.ticker,
    quantity: settlement.quantity.toString(),
    totalAmount: settlement.totalAmount.toString(),
  });

  console.log("\n✅ Full order-to-settlement lifecycle completed successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
