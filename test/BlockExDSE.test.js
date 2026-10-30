// Standard Hardhat + mocha/chai test file.
//
// NOTE FOR THE TEAM: this file uses the normal `npx hardhat test` workflow
// that every Hardhat tutorial teaches. It will work exactly as written on
// your own laptops with normal internet access (Hardhat downloads the
// Solidity compiler automatically the first time you run it).
//
// The sandbox this was originally built in could not reach the compiler
// download server, so scripts/deploy-and-test.js was used there instead as
// a workaround (manual solc via npm + explicit deployment). Once you're on
// your own machines, just run:
//   npx hardhat test
// and this file is what will actually run.

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BlockExDSE", function () {
  let contract, admin, buyer, seller, outsider;

  beforeEach(async function () {
    [admin, buyer, seller, outsider] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("BlockExDSE");
    contract = await Factory.deploy();
    await contract.waitForDeployment();

    await contract.verifyParticipant(buyer.address);
    await contract.verifyParticipant(seller.address);
  });

  describe("KYC enforcement (Parameter P17)", function () {
    it("rejects orders from unverified participants", async function () {
      await expect(
        contract.connect(outsider).placeOrder("DSEX", 0, 100, 50)
      ).to.be.revertedWith("BlockExDSE: participant not KYC verified");
    });

    it("allows orders from verified participants", async function () {
      await expect(contract.connect(buyer).placeOrder("DSEX", 0, 100, 50)).to.not.be.reverted;
    });
  });

  describe("Order placement", function () {
    it("rejects zero quantity", async function () {
      await expect(
        contract.connect(buyer).placeOrder("DSEX", 0, 0, 50)
      ).to.be.revertedWith("BlockExDSE: quantity must be positive");
    });

    it("rejects zero price", async function () {
      await expect(
        contract.connect(buyer).placeOrder("DSEX", 0, 100, 0)
      ).to.be.revertedWith("BlockExDSE: price must be positive");
    });

    it("emits OrderPlaced with correct fields", async function () {
      await expect(contract.connect(buyer).placeOrder("DSEX", 0, 100, 50))
        .to.emit(contract, "OrderPlaced")
        .withArgs(1, buyer.address, "DSEX", 0, 100, 50);
    });
  });

  describe("Matching and settlement — full lifecycle", function () {
    it("matches and settles a buy/sell pair, anchoring an off-chain hash", async function () {
      await contract.connect(buyer).placeOrder("DSEX", 0, 100, 50);
      await contract.connect(seller).placeOrder("DSEX", 1, 100, 50);

      await expect(contract.recordMatch(1, 2, 50, 100))
        .to.emit(contract, "OrdersMatched")
        .withArgs(1, 1, 2, 50, 100);

      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("off-chain-record"));
      await expect(contract.settleTrade(1, fakeHash))
        .to.emit(contract, "TradeSettled")
        .withArgs(1, 1, buyer.address, seller.address, fakeHash);

      const settlement = await contract.getSettlement(1);
      expect(settlement.buyer).to.equal(buyer.address);
      expect(settlement.seller).to.equal(seller.address);
      expect(settlement.totalAmount).to.equal(50n * 100n);

      // Parameter P9: Hash Anchor Integrity
      expect(await contract.verifyOffChainHash(1, fakeHash)).to.equal(true);
      const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("tampered-record"));
      expect(await contract.verifyOffChainHash(1, wrongHash)).to.equal(false);
    });

    it("only allows delegates to record matches (double-spend / access control)", async function () {
      await contract.connect(buyer).placeOrder("DSEX", 0, 100, 50);
      await contract.connect(seller).placeOrder("DSEX", 1, 100, 50);

      await expect(
        contract.connect(buyer).recordMatch(1, 2, 50, 100)
      ).to.be.revertedWith("BlockExDSE: caller is not an elected delegate");
    });
  });

  describe("Order cancellation", function () {
    it("lets a trader cancel their own pending order", async function () {
      await contract.connect(buyer).placeOrder("DSEX", 0, 100, 50);
      await expect(contract.connect(buyer).cancelOrder(1)).to.emit(contract, "OrderCancelled").withArgs(1);
    });

    it("prevents cancelling someone else's order", async function () {
      await contract.connect(buyer).placeOrder("DSEX", 0, 100, 50);
      await expect(contract.connect(seller).cancelOrder(1)).to.be.revertedWith("BlockExDSE: not your order");
    });
  });
});
