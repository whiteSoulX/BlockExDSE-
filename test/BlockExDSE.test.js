// Standard Hardhat + mocha/chai test file. Run with `npx hardhat test`.

const { expect } = require("chai");
const { ethers } = require("hardhat");

const Tier = { FAST: 0, FULL: 1 };
const OrderKind = { LIMIT: 0, MARKET: 1, IOC: 2, FOK: 3 };
const OrderStatus = { PENDING: 0, PARTIALLY_FILLED: 1, MATCHED: 2, SETTLED: 3, CANCELLED: 4 };

function digestOf(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

describe("BlockExDSE", function () {
  let contract, admin, delegate2, buyer, seller, outsider;

  beforeEach(async function () {
    [admin, delegate2, buyer, seller, outsider] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("BlockExDSE");
    contract = await Factory.deploy();
    await contract.waitForDeployment();

    await contract.addDelegate(delegate2.address);
    await contract.verifyParticipant(buyer.address);
    await contract.verifyParticipant(seller.address);
  });

  describe("KYC enforcement", function () {
    it("rejects orders from unverified participants", async function () {
      await expect(
        contract.connect(outsider).placeOrder("DSEX", 0, 100, 50)
      ).to.be.revertedWith("BlockExDSE: participant not KYC verified");
    });

    it("allows orders from verified participants", async function () {
      await expect(contract.connect(buyer).placeOrder("DSEX", 0, 100, 50)).to.not.be.reverted;
    });
  });

  describe("Order placement (direct/control path — FR12)", function () {
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
        .withArgs(1, buyer.address, "DSEX", 0, OrderKind.LIMIT, 100, 50, ethers.ZeroHash);
    });
  });

  describe("Risk-adaptive batch consensus (core contribution)", function () {
    it("routes a low-risk batch to FAST and finalizes it on a single delegate signature", async function () {
      const digest = digestOf("batch-low-risk");
      await expect(contract.proposeBatch(digest, 1000)) // 10% risk, below default 50% threshold
        .to.emit(contract, "BatchFinalized")
        .withArgs(digest, Tier.FAST);

      const batch = await contract.getBatch(digest);
      expect(batch.tier).to.equal(Tier.FAST);
      expect(batch.finalized).to.equal(true);
    });

    it("routes a high-risk batch to FULL and requires a quorum vote before finality", async function () {
      const digest = digestOf("batch-high-risk");
      await contract.proposeBatch(digest, 9000); // 90% risk, above threshold

      let batch = await contract.getBatch(digest);
      expect(batch.tier).to.equal(Tier.FULL);
      expect(batch.finalized).to.equal(false); // only 1 of 2 quorum votes so far

      await expect(contract.connect(delegate2).voteBatch(digest))
        .to.emit(contract, "BatchFinalized")
        .withArgs(digest, Tier.FULL);

      batch = await contract.getBatch(digest);
      expect(batch.finalized).to.equal(true);
    });

    it("blocks orders against a FAST batch until the challenge window elapses", async function () {
      const digest = digestOf("batch-fast-wait");
      await contract.proposeBatch(digest, 1000);

      await expect(
        contract.placeBatchedOrder(buyer.address, "DSEX", 0, OrderKind.LIMIT, 100, 50, digest)
      ).to.be.revertedWith("BlockExDSE: batch not finalized or still in challenge window");

      // advance past the default 3-block challenge window
      for (let i = 0; i < 4; i++) await ethers.provider.send("evm_mine");

      await expect(contract.placeBatchedOrder(buyer.address, "DSEX", 0, OrderKind.LIMIT, 100, 50, digest))
        .to.emit(contract, "OrderPlaced");
    });

    it("allows orders against a FULL batch immediately once quorum is reached, no extra wait", async function () {
      const digest = digestOf("batch-full-immediate");
      await contract.proposeBatch(digest, 9000);
      await contract.connect(delegate2).voteBatch(digest);

      await expect(contract.placeBatchedOrder(buyer.address, "DSEX", 0, OrderKind.LIMIT, 100, 50, digest))
        .to.emit(contract, "OrderPlaced");
    });

    it("lets a non-proposing delegate challenge a FAST batch within the window, permanently blocking it", async function () {
      const digest = digestOf("batch-disputed");
      await contract.proposeBatch(digest, 1000);

      await expect(contract.connect(delegate2).challengeBatch(digest))
        .to.emit(contract, "BatchChallenged")
        .withArgs(digest, delegate2.address);

      for (let i = 0; i < 4; i++) await ethers.provider.send("evm_mine");

      await expect(
        contract.placeBatchedOrder(buyer.address, "DSEX", 0, OrderKind.LIMIT, 100, 50, digest)
      ).to.be.revertedWith("BlockExDSE: batch not finalized or still in challenge window");
    });

    it("prevents a delegate from voting twice on the same FULL batch", async function () {
      const digest = digestOf("batch-double-vote");
      await contract.proposeBatch(digest, 9000);
      await expect(contract.voteBatch(digest)).to.be.revertedWith("BlockExDSE: delegate already voted");
    });

    it("prevents proposing the same batch digest twice", async function () {
      const digest = digestOf("batch-replay");
      await contract.proposeBatch(digest, 1000);
      await expect(contract.proposeBatch(digest, 1000)).to.be.revertedWith("BlockExDSE: batch already proposed");
    });

    it("rejects placing an order against an unproposed batch", async function () {
      const digest = digestOf("batch-never-proposed");
      await expect(
        contract.placeBatchedOrder(buyer.address, "DSEX", 0, OrderKind.LIMIT, 100, 50, digest)
      ).to.be.revertedWith("BlockExDSE: batch not finalized or still in challenge window");
    });
  });

  describe("Partial fills (FR17)", function () {
    it("supports matching an order across multiple partial fills", async function () {
      await contract.connect(buyer).placeOrder("DSEX", 0, 100, 50);   // order 1: buy 100
      await contract.connect(seller).placeOrder("DSEX", 1, 60, 50);   // order 2: sell 60
      await contract.connect(seller).placeOrder("DSEX", 1, 40, 50);   // order 3: sell 40

      await contract.recordMatch(1, 2, 50, 60);
      let buyOrder = await contract.getOrder(1);
      expect(buyOrder.status).to.equal(OrderStatus.PARTIALLY_FILLED);
      expect(buyOrder.remaining).to.equal(40);

      await contract.recordMatch(1, 3, 50, 40);
      buyOrder = await contract.getOrder(1);
      expect(buyOrder.status).to.equal(OrderStatus.MATCHED);
      expect(buyOrder.remaining).to.equal(0);
    });

    it("rejects a match quantity exceeding an order's remaining quantity", async function () {
      await contract.connect(buyer).placeOrder("DSEX", 0, 50, 50);
      await contract.connect(seller).placeOrder("DSEX", 1, 100, 50);
      await expect(contract.recordMatch(1, 2, 50, 100)).to.be.revertedWith("BlockExDSE: quantity exceeds remaining");
    });

    it("allows cancelling a partially filled order", async function () {
      await contract.connect(buyer).placeOrder("DSEX", 0, 100, 50);
      await contract.connect(seller).placeOrder("DSEX", 1, 40, 50);
      await contract.recordMatch(1, 2, 50, 40);
      await expect(contract.connect(buyer).cancelOrder(1)).to.emit(contract, "OrderCancelled");
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

      expect(await contract.verifyOffChainHash(1, fakeHash)).to.equal(true);
      const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("tampered-record"));
      expect(await contract.verifyOffChainHash(1, wrongHash)).to.equal(false);
    });

    it("only allows delegates to record matches (access control)", async function () {
      await contract.connect(buyer).placeOrder("DSEX", 0, 100, 50);
      await contract.connect(seller).placeOrder("DSEX", 1, 100, 50);

      await expect(
        contract.connect(buyer).recordMatch(1, 2, 50, 100)
      ).to.be.revertedWith("BlockExDSE: caller is not an elected delegate");
    });

    it("only allows delegates to place batched orders on behalf of a trader", async function () {
      const digest = digestOf("batch-access-control");
      await contract.proposeBatch(digest, 1000);
      for (let i = 0; i < 4; i++) await ethers.provider.send("evm_mine");

      await expect(
        contract.connect(buyer).placeBatchedOrder(buyer.address, "DSEX", 0, OrderKind.LIMIT, 100, 50, digest)
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
