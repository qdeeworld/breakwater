// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// Derived from 1inch/swap-vm-template test/AquaAMM.test.ts on 2026-09-04.
// © 2025 Degensoft Ltd; © 2026 Breakwater contributors.

import "@nomicfoundation/hardhat-chai-matchers";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployContract } from "@1inch/solidity-utils";
import { Signer } from "ethers";
import { expect, ether } from "@1inch/solidity-utils";

import { Aqua } from "../typechain-types/@1inch/aqua/src/Aqua";
import { AquaSwapVMRouter } from "../typechain-types/@1inch/swap-vm/src/routers/AquaSwapVMRouter";
import { WETHMock } from "../typechain-types/@1inch/swap-vm/test/mocks/WETHMock";
import { TokenMock } from "../typechain-types/@1inch/solidity-utils/contracts/mocks/TokenMock";
import { BreakwaterAMM } from "../typechain-types/contracts/BreakwaterAMM";
import { BreakwaterGuard } from "../typechain-types/contracts/BreakwaterGuard";
import { MockPriceFeed } from "../typechain-types/contracts/MockPriceFeed";
import { TakerTraitsLib } from "./utils/SwapVMHelpers";

const { ethers } = require("hardhat");

const ONE = 10n ** 18n;
const FEED_ONE = 100_000_000n;
const FEED_DEPEG = 94_000_000n;
const TRIGGER_RATIO = 98n * 10n ** 16n;
const UNWIND_DISCOUNT_BPS = 50;
const MAX_STALENESS = 3_600;
const LINEAR_WIDTH = 100n * 10n ** 27n;

interface Fixture {
  accounts: { owner: Signer; maker: Signer; taker: Signer };
  tokens: { bad: TokenMock; good: TokenMock };
  feeds: { bad: MockPriceFeed; good: MockPriceFeed };
  contracts: {
    aqua: Aqua;
    router: AquaSwapVMRouter;
    amm: BreakwaterAMM;
    guard: BreakwaterGuard;
  };
  directions: { toxicIsAToB: boolean; exitIsAToB: boolean };
  order: { maker: string; traits: bigint; data: string };
  orderHash: string;
}

interface FixtureConfig {
  curveBad?: bigint;
  curveGood?: bigint;
  shipBad?: bigint;
  shipGood?: bigint;
}

async function setupFixtureForOrdering(
  badIsLower: boolean,
  config: FixtureConfig = {}
): Promise<Fixture> {
  const [owner, maker, taker]: Signer[] = await ethers.getSigners();

  const aqua = await deployContract("Aqua") as unknown as Aqua;
  const weth = await deployContract("WETHMock") as unknown as WETHMock;
  const router = await deployContract("AquaSwapVMRouter", [
    await aqua.getAddress(),
    await weth.getAddress(),
    await owner.getAddress(),
    "Breakwater SwapVM",
    "1.0.0"
  ]) as unknown as AquaSwapVMRouter;
  const amm = await deployContract("BreakwaterAMM", [await aqua.getAddress()]) as unknown as BreakwaterAMM;

  let tokenA = await deployContract("TokenMock", ["Stablecoin A", "USDA"]) as unknown as TokenMock;
  let tokenB = await deployContract("TokenMock", ["Stablecoin B", "USDB"]) as unknown as TokenMock;
  if ((await tokenA.getAddress()).toLowerCase() > (await tokenB.getAddress()).toLowerCase()) {
    [tokenA, tokenB] = [tokenB, tokenA];
  }
  const bad = badIsLower ? tokenA : tokenB;
  const good = badIsLower ? tokenB : tokenA;

  const badFeed = await deployContract("MockPriceFeed", [8, FEED_ONE]) as unknown as MockPriceFeed;
  const goodFeed = await deployContract("MockPriceFeed", [8, FEED_ONE]) as unknown as MockPriceFeed;
  const guard = await deployContract("BreakwaterGuard", [
    await router.getAddress(),
    await bad.getAddress(),
    await good.getAddress(),
    await badFeed.getAddress(),
    await goodFeed.getAddress(),
    MAX_STALENESS,
    TRIGGER_RATIO,
    UNWIND_DISCOUNT_BPS
  ]) as unknown as BreakwaterGuard;

  const curveBad = config.curveBad ?? ether("100");
  const curveGood = config.curveGood ?? ether("100");
  const shipBad = config.shipBad ?? ether("100");
  const shipGood = config.shipGood ?? ether("100");

  const built = await amm.buildProgram(
    await maker.getAddress(),
    await bad.getAddress(),
    await good.getAddress(),
    await guard.getAddress(),
    curveBad,
    curveGood,
    1,
    1,
    LINEAR_WIDTH,
    1,
    0
  );
  const order = { maker: built.maker, traits: built.traits, data: built.data };

  await bad.mint(await maker.getAddress(), ether("1000"));
  await good.mint(await maker.getAddress(), ether("1000"));
  await bad.mint(await taker.getAddress(), ether("1000"));
  await good.mint(await taker.getAddress(), ether("1000"));
  await bad.connect(maker).approve(await aqua.getAddress(), ethers.MaxUint256);
  await good.connect(maker).approve(await aqua.getAddress(), ethers.MaxUint256);

  await aqua.connect(maker).ship(
    await router.getAddress(),
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(address maker, uint256 traits, bytes data)"],
      [order]
    ),
    [await tokenA.getAddress(), await tokenB.getAddress()],
    badIsLower ? [shipBad, shipGood] : [shipGood, shipBad]
  );

  return {
    accounts: { owner, maker, taker },
    tokens: { bad, good },
    feeds: { bad: badFeed, good: goodFeed },
    contracts: { aqua, router, amm, guard },
    directions: { toxicIsAToB: badIsLower, exitIsAToB: !badIsLower },
    order,
    orderHash: await router.hash(order)
  };
}

async function setupFixture(): Promise<Fixture> {
  return setupFixtureForOrdering(true);
}

async function setupBadHighFixture(): Promise<Fixture> {
  return setupFixtureForOrdering(false);
}

async function setupImbalancedFixture(): Promise<Fixture> {
  return setupFixtureForOrdering(true, { shipBad: ether("100"), shipGood: ether("1") });
}

function traits(taker: string, isAToB: boolean, isExactIn = true, threshold?: bigint): string {
  return TakerTraitsLib.build({
    taker,
    isAToB,
    isExactIn,
    threshold,
    useTransferFromAndAquaPush: true
  });
}

describe("BreakwaterAMM", function () {
  it("keeps the official pegged position two-way while healthy", async function () {
    const {
      accounts: { taker },
      tokens: { bad, good },
      contracts: { router },
      directions,
      order
    } = await loadFixture(setupFixture);
    const takerAddress = await taker.getAddress();

    const badToGood = traits(takerAddress, directions.toxicIsAToB);
    const goodToBad = traits(takerAddress, directions.exitIsAToB);
    const amountIn = ether("10");

    const firstQuote = await router.connect(taker).quote.staticCall(order, amountIn, badToGood);
    expect(firstQuote.amountOut).to.be.gt(0);
    await bad.connect(taker).approve(await router.getAddress(), amountIn);
    await expect(router.connect(taker).swap(order, amountIn, badToGood)).to.emit(router, "Swapped");

    const secondQuote = await router.connect(taker).quote.staticCall(order, amountIn, goodToBad);
    expect(secondQuote.amountOut).to.be.gt(0);
    await good.connect(taker).approve(await router.getAddress(), amountIn);
    await expect(router.connect(taker).swap(order, amountIn, goodToBad)).to.emit(router, "Swapped");
  });

  it("blocks a stressed swap that would push the impaired token to the maker", async function () {
    const {
      accounts: { maker, taker },
      tokens: { bad },
      feeds: { bad: badFeed },
      contracts: { aqua, router, guard },
      directions,
      order,
      orderHash
    } = await loadFixture(setupFixture);
    await badFeed.setAnswer(FEED_DEPEG);

    const takerAddress = await taker.getAddress();
    const toxicTraits = traits(takerAddress, directions.toxicIsAToB);
    const amountIn = ether("10");
    const before = await aqua.rawBalances(
      await maker.getAddress(),
      await router.getAddress(),
      orderHash,
      await bad.getAddress()
    );

    await expect(router.connect(taker).quote.staticCall(order, amountIn, toxicTraits))
      .to.be.revertedWithCustomError(guard, "ToxicDirectionBlocked")
      .withArgs(await bad.getAddress());

    await bad.connect(taker).approve(await router.getAddress(), amountIn);
    await expect(router.connect(taker).swap(order, amountIn, toxicTraits))
      .to.be.revertedWithCustomError(guard, "ToxicDirectionBlocked")
      .withArgs(await bad.getAddress());

    const after = await aqua.rawBalances(
      await maker.getAddress(),
      await router.getAddress(),
      orderHash,
      await bad.getAddress()
    );
    expect(after.balance).to.equal(before.balance);
  });

  it("prices and settles a stressed exit while strictly reducing impaired exposure", async function () {
    const {
      accounts: { maker, taker },
      tokens: { bad, good },
      feeds: { bad: badFeed },
      contracts: { aqua, router },
      directions,
      order,
      orderHash
    } = await loadFixture(setupFixture);
    await badFeed.setAnswer(FEED_DEPEG);

    const takerAddress = await taker.getAddress();
    const exitTraits = traits(takerAddress, directions.exitIsAToB);
    const amountIn = ether("10");
    const effectiveExitPrice = FEED_DEPEG * (10_000n - BigInt(UNWIND_DISCOUNT_BPS)) * 10n ** 10n / 10_000n;
    const expectedBadOut = amountIn * ONE / effectiveExitPrice;
    const quote = await router.connect(taker).quote.staticCall(order, amountIn, exitTraits);
    expect(quote.amountIn).to.equal(amountIn);
    expect(quote.amountOut).to.equal(expectedBadOut);

    const makerAddress = await maker.getAddress();
    const routerAddress = await router.getAddress();
    const badAddress = await bad.getAddress();
    const goodAddress = await good.getAddress();
    const virtualBadBefore = await aqua.rawBalances(makerAddress, routerAddress, orderHash, badAddress);
    const virtualGoodBefore = await aqua.rawBalances(makerAddress, routerAddress, orderHash, goodAddress);
    const makerBadBefore = await bad.balanceOf(makerAddress);
    const takerBadBefore = await bad.balanceOf(takerAddress);

    await good.connect(taker).approve(routerAddress, amountIn);
    await expect(router.connect(taker).swap(order, amountIn, exitTraits)).to.emit(router, "Swapped");

    const virtualBadAfter = await aqua.rawBalances(makerAddress, routerAddress, orderHash, badAddress);
    const virtualGoodAfter = await aqua.rawBalances(makerAddress, routerAddress, orderHash, goodAddress);
    expect(virtualBadAfter.balance).to.equal(virtualBadBefore.balance - expectedBadOut);
    expect(virtualGoodAfter.balance).to.equal(virtualGoodBefore.balance + amountIn);
    expect(await bad.balanceOf(makerAddress)).to.equal(makerBadBefore - expectedBadOut);
    expect(await bad.balanceOf(takerAddress)).to.equal(takerBadBefore + expectedBadOut);
  });

  it("uses both authenticated feeds when pricing the stressed exit", async function () {
    const {
      accounts: { taker },
      feeds: { bad: badFeed, good: goodFeed },
      contracts: { router },
      directions,
      order
    } = await loadFixture(setupFixture);
    await badFeed.setAnswer(FEED_DEPEG);
    await goodFeed.setAnswer(102_000_000);

    const amountIn = ether("10");
    const badUsdE18 = FEED_DEPEG * 10n ** 10n;
    const goodUsdE18 = 102_000_000n * 10n ** 10n;
    const goodPerBad = (badUsdE18 * ONE + goodUsdE18 - 1n) / goodUsdE18;
    const discountFactor = 10_000n - BigInt(UNWIND_DISCOUNT_BPS);
    const effectiveExitPrice = (goodPerBad * discountFactor + 9_999n) / 10_000n;
    const expectedBadOut = amountIn * ONE / effectiveExitPrice;

    const quote = await router.connect(taker).quote.staticCall(
      order,
      amountIn,
      traits(await taker.getAddress(), directions.exitIsAToB)
    );
    expect(quote.amountOut).to.equal(expectedBadOut);
  });

  it("keeps the stressed exit live when the preceding pegged curve would be imbalanced", async function () {
    const {
      accounts: { maker, taker },
      tokens: { bad, good },
      feeds: { bad: badFeed },
      contracts: { aqua, router },
      directions,
      order,
      orderHash
    } = await loadFixture(setupImbalancedFixture);
    await badFeed.setAnswer(FEED_DEPEG);

    const amountIn = ether("10");
    const exitTraits = traits(await taker.getAddress(), directions.exitIsAToB);
    const before = await aqua.rawBalances(
      await maker.getAddress(),
      await router.getAddress(),
      orderHash,
      await bad.getAddress()
    );
    const quote = await router.connect(taker).quote.staticCall(order, amountIn, exitTraits);
    await good.connect(taker).approve(await router.getAddress(), amountIn);
    await expect(router.connect(taker).swap(order, amountIn, exitTraits)).to.emit(router, "Swapped");
    const after = await aqua.rawBalances(
      await maker.getAddress(),
      await router.getAddress(),
      orderHash,
      await bad.getAddress()
    );
    expect(after.balance).to.equal(before.balance - quote.amountOut);
  });

  it("supports an exact-output stressed exit with maker-protecting rounding", async function () {
    const {
      accounts: { maker, taker },
      tokens: { bad, good },
      feeds: { bad: badFeed },
      contracts: { aqua, router },
      directions,
      order,
      orderHash
    } = await loadFixture(setupFixture);
    await badFeed.setAnswer(FEED_DEPEG);

    const desiredBadOut = ether("10");
    const effectiveExitPrice = FEED_DEPEG * (10_000n - BigInt(UNWIND_DISCOUNT_BPS)) * 10n ** 10n / 10_000n;
    const expectedGoodIn = (desiredBadOut * effectiveExitPrice + ONE - 1n) / ONE;
    const exitTraits = traits(
      await taker.getAddress(),
      directions.exitIsAToB,
      false,
      expectedGoodIn
    );
    const quote = await router.connect(taker).quote.staticCall(order, desiredBadOut, exitTraits);
    expect(quote.amountOut).to.equal(desiredBadOut);
    expect(quote.amountIn).to.equal(expectedGoodIn);

    const before = await aqua.rawBalances(
      await maker.getAddress(),
      await router.getAddress(),
      orderHash,
      await bad.getAddress()
    );
    await good.connect(taker).approve(await router.getAddress(), expectedGoodIn);
    await router.connect(taker).swap(order, desiredBadOut, exitTraits);
    const after = await aqua.rawBalances(
      await maker.getAddress(),
      await router.getAddress(),
      orderHash,
      await bad.getAddress()
    );
    expect(after.balance).to.equal(before.balance - desiredBadOut);
  });

  it("treats the trigger boundary as healthy and the first lower feed tick as stressed", async function () {
    const {
      accounts: { taker },
      feeds: { bad: badFeed },
      contracts: { router, guard },
      directions,
      order
    } = await loadFixture(setupFixture);
    const amountIn = ether("10");
    const toxicTraits = traits(await taker.getAddress(), directions.toxicIsAToB);

    await badFeed.setAnswer(98_000_000);
    const boundaryQuote = await router.connect(taker).quote.staticCall(order, amountIn, toxicTraits);
    expect(boundaryQuote.amountOut).to.be.gt(0);

    await badFeed.setAnswer(97_999_999);
    await expect(router.connect(taker).quote.staticCall(order, amountIn, toxicTraits))
      .to.be.revertedWithCustomError(guard, "ToxicDirectionBlocked");
  });

  it("rechecks the feed at execution when a healthy quote becomes stressed", async function () {
    const {
      accounts: { maker, taker },
      tokens: { bad },
      feeds: { bad: badFeed },
      contracts: { aqua, router, guard },
      directions,
      order,
      orderHash
    } = await loadFixture(setupFixture);
    const takerAddress = await taker.getAddress();
    const toxicTraits = traits(takerAddress, directions.toxicIsAToB);
    const amountIn = ether("10");

    const healthyQuote = await router.connect(taker).quote.staticCall(order, amountIn, toxicTraits);
    expect(healthyQuote.amountOut).to.be.gt(0);
    const before = await aqua.rawBalances(
      await maker.getAddress(),
      await router.getAddress(),
      orderHash,
      await bad.getAddress()
    );

    await badFeed.setAnswer(FEED_DEPEG);
    await bad.connect(taker).approve(await router.getAddress(), amountIn);
    await expect(router.connect(taker).swap(order, amountIn, toxicTraits))
      .to.be.revertedWithCustomError(guard, "ToxicDirectionBlocked");

    const after = await aqua.rawBalances(
      await maker.getAddress(),
      await router.getAddress(),
      orderHash,
      await bad.getAddress()
    );
    expect(after.balance).to.equal(before.balance);
  });

  it("fails closed on stale or invalid oracle data", async function () {
    const {
      accounts: { taker },
      feeds: { bad: badFeed },
      contracts: { router, guard },
      directions,
      order
    } = await loadFixture(setupFixture);
    const now = await time.latest();
    const exitTraits = traits(await taker.getAddress(), directions.exitIsAToB);

    await badFeed.setRoundData(2, FEED_DEPEG, now - MAX_STALENESS - 1, now - MAX_STALENESS - 1, 2);
    await expect(router.connect(taker).quote.staticCall(order, ether("10"), exitTraits))
      .to.be.revertedWithCustomError(guard, "StaleFeed");

    await badFeed.setRoundData(3, 0, now, now, 3);
    await expect(router.connect(taker).quote.staticCall(order, ether("10"), exitTraits))
      .to.be.revertedWithCustomError(guard, "InvalidFeedAnswer");

    await badFeed.setRoundData(4, FEED_DEPEG, now, now, 3);
    await expect(router.connect(taker).quote.staticCall(order, ether("10"), exitTraits))
      .to.be.revertedWithCustomError(guard, "InvalidFeedRound");
  });

  it("fails closed when the reference feed is stale", async function () {
    const {
      accounts: { taker },
      feeds: { good: goodFeed },
      contracts: { router, guard },
      directions,
      order
    } = await loadFixture(setupFixture);
    const now = await time.latest();
    await goodFeed.setRoundData(2, FEED_ONE, now - MAX_STALENESS - 1, now - MAX_STALENESS - 1, 2);

    await expect(router.connect(taker).quote.staticCall(
      order,
      ether("10"),
      traits(await taker.getAddress(), directions.exitIsAToB)
    )).to.be.revertedWithCustomError(guard, "StaleFeed");
  });

  it("enforces the same stressed invariant when the impaired token has the higher address", async function () {
    const {
      accounts: { maker, taker },
      tokens: { bad, good },
      feeds: { bad: badFeed },
      contracts: { aqua, router, guard },
      directions,
      order,
      orderHash
    } = await loadFixture(setupBadHighFixture);
    await badFeed.setAnswer(FEED_DEPEG);

    const takerAddress = await taker.getAddress();
    const amountIn = ether("10");
    const toxicTraits = traits(takerAddress, directions.toxicIsAToB);
    const exitTraits = traits(takerAddress, directions.exitIsAToB);

    await expect(router.connect(taker).quote.staticCall(order, amountIn, toxicTraits))
      .to.be.revertedWithCustomError(guard, "ToxicDirectionBlocked");

    const badAddress = await bad.getAddress();
    const before = await aqua.rawBalances(
      await maker.getAddress(),
      await router.getAddress(),
      orderHash,
      badAddress
    );
    await good.connect(taker).approve(await router.getAddress(), amountIn);
    const quote = await router.connect(taker).quote.staticCall(order, amountIn, exitTraits);
    await router.connect(taker).swap(order, amountIn, exitTraits);
    const after = await aqua.rawBalances(
      await maker.getAddress(),
      await router.getAddress(),
      orderHash,
      badAddress
    );
    expect(after.balance).to.equal(before.balance - quote.amountOut);
    expect(after.balance).to.be.lt(before.balance);
  });
});
