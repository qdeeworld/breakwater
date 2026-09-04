// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// © 2026 Breakwater contributors.

import "@nomicfoundation/hardhat-chai-matchers";
import { deployContract } from "@1inch/solidity-utils";
import { expect } from "@1inch/solidity-utils";

import { Aqua } from "../typechain-types/@1inch/aqua/src/Aqua";
import { AquaSwapVMRouter } from "../typechain-types/@1inch/swap-vm/src/routers/AquaSwapVMRouter";
import { WETHMock } from "../typechain-types/@1inch/swap-vm/test/mocks/WETHMock";
import { BreakwaterAMM } from "../typechain-types/contracts/BreakwaterAMM";
import { BreakwaterGuard } from "../typechain-types/contracts/BreakwaterGuard";
import { MockPriceFeed } from "../typechain-types/contracts/MockPriceFeed";
import { MockToken } from "../typechain-types/contracts/MockToken";
import { TakerTraitsLib } from "./utils/SwapVMHelpers";

const { ethers } = require("hardhat");

const ONE = 10n ** 18n;
const BAD_UNIT = 10n ** 6n;
const GOOD_UNIT = ONE;
const BAD_USD = 94_000_000n;
const GOOD_USD = 1_020_000_000_000_000_000n;
const TRIGGER_RATIO = 98n * 10n ** 16n;
const UNWIND_DISCOUNT_BPS = 50n;

describe("Breakwater mixed token decimals", function () {
  it("normalizes and settles a stressed 6-decimal/18-decimal exit", async function () {
    const [owner, maker, taker] = await ethers.getSigners();
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
    const bad = await deployContract("MockToken", ["Six Decimal Bad", "BAD6", 6]) as unknown as MockToken;
    const good = await deployContract("MockToken", ["Eighteen Decimal Good", "GOOD18", 18]) as unknown as MockToken;
    const badFeed = await deployContract("MockPriceFeed", [8, BAD_USD]) as unknown as MockPriceFeed;
    const goodFeed = await deployContract("MockPriceFeed", [18, GOOD_USD]) as unknown as MockPriceFeed;
    const guard = await deployContract("BreakwaterGuard", [
      await router.getAddress(),
      await bad.getAddress(),
      await good.getAddress(),
      await badFeed.getAddress(),
      await goodFeed.getAddress(),
      3_600,
      TRIGGER_RATIO,
      UNWIND_DISCOUNT_BPS
    ]) as unknown as BreakwaterGuard;

    const badLiquidity = 100n * BAD_UNIT;
    const goodLiquidity = 100n * GOOD_UNIT;
    const built = await amm.buildProgram(
      await maker.getAddress(),
      await bad.getAddress(),
      await good.getAddress(),
      await guard.getAddress(),
      badLiquidity,
      goodLiquidity,
      10n ** 12n,
      1,
      100n * 10n ** 27n,
      1,
      0
    );
    const order = { maker: built.maker, traits: built.traits, data: built.data };
    const badAddress = await bad.getAddress();
    const goodAddress = await good.getAddress();
    const routerAddress = await router.getAddress();
    const aquaAddress = await aqua.getAddress();
    const makerAddress = await maker.getAddress();
    const takerAddress = await taker.getAddress();
    const badIsLower = badAddress.toLowerCase() < goodAddress.toLowerCase();

    await bad.mint(makerAddress, 1_000n * BAD_UNIT);
    await good.mint(makerAddress, 1_000n * GOOD_UNIT);
    await good.mint(takerAddress, 20n * GOOD_UNIT);
    await bad.connect(maker).approve(aquaAddress, ethers.MaxUint256);
    await good.connect(maker).approve(aquaAddress, ethers.MaxUint256);
    await aqua.connect(maker).ship(
      routerAddress,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address maker, uint256 traits, bytes data)"],
        [order]
      ),
      badIsLower ? [badAddress, goodAddress] : [goodAddress, badAddress],
      badIsLower ? [badLiquidity, goodLiquidity] : [goodLiquidity, badLiquidity]
    );

    const amountIn = 10n * GOOD_UNIT;
    const badUsdE18 = BAD_USD * 10n ** 10n;
    const goodPerBadE18 = (badUsdE18 * ONE + GOOD_USD - 1n) / GOOD_USD;
    const unwindPriceE18 = (goodPerBadE18 * (10_000n - UNWIND_DISCOUNT_BPS) + 9_999n) / 10_000n;
    const expectedBadOut = amountIn * BAD_UNIT * ONE / (GOOD_UNIT * unwindPriceE18);
    const takerData = TakerTraitsLib.build({
      taker: takerAddress,
      isExactIn: true,
      isAToB: !badIsLower,
      useTransferFromAndAquaPush: true
    });

    const quote = await router.connect(taker).quote.staticCall(order, amountIn, takerData);
    expect(quote.amountIn).to.equal(amountIn);
    expect(quote.amountOut).to.equal(expectedBadOut);
    expect(goodPerBadE18).to.equal(921_568_627_450_980_393n);
    expect(unwindPriceE18).to.equal(916_960_784_313_725_492n);
    expect(quote.amountOut).to.equal(10_905_591n);

    const orderHash = await router.hash(order);
    const badBefore = await aqua.rawBalances(makerAddress, routerAddress, orderHash, badAddress);
    const goodBefore = await aqua.rawBalances(makerAddress, routerAddress, orderHash, goodAddress);
    const makerBadBefore = await bad.balanceOf(makerAddress);
    const takerBadBefore = await bad.balanceOf(takerAddress);
    await good.connect(taker).approve(routerAddress, amountIn);
    await expect(router.connect(taker).swap(order, amountIn, takerData)).to.emit(router, "Swapped");
    const badAfter = await aqua.rawBalances(makerAddress, routerAddress, orderHash, badAddress);
    const goodAfter = await aqua.rawBalances(makerAddress, routerAddress, orderHash, goodAddress);

    expect(badAfter.balance).to.equal(badBefore.balance - expectedBadOut);
    expect(goodAfter.balance).to.equal(goodBefore.balance + amountIn);
    expect(await bad.balanceOf(makerAddress)).to.equal(makerBadBefore - expectedBadOut);
    expect(await bad.balanceOf(takerAddress)).to.equal(takerBadBefore + expectedBadOut);

    const desiredBadOut = 10n * BAD_UNIT;
    const denominator = BAD_UNIT * ONE;
    const expectedGoodIn = (
      desiredBadOut * GOOD_UNIT * unwindPriceE18 + denominator - 1n
    ) / denominator;
    const exactOutData = TakerTraitsLib.build({
      taker: takerAddress,
      isExactIn: false,
      isAToB: !badIsLower,
      threshold: expectedGoodIn,
      useTransferFromAndAquaPush: true
    });
    const exactOutQuote = await router.connect(taker).quote.staticCall(order, desiredBadOut, exactOutData);
    expect(exactOutQuote.amountOut).to.equal(desiredBadOut);
    expect(exactOutQuote.amountIn).to.equal(9_169_607_843_137_254_920n);
    await good.connect(taker).approve(routerAddress, exactOutQuote.amountIn);
    await expect(router.connect(taker).swap(order, desiredBadOut, exactOutData)).to.emit(router, "Swapped");
  });
});
