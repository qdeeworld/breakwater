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
import { TakerTraitsLib } from "./utils/SwapVMHelpers";

const { ethers } = require("hardhat");

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const USDC_USD_FEED = "0x8fffffd4afb6115b954bd326cbe7b4ba576818f6";
const USDT_USD_FEED = "0x3e7d1eab13ad0104d2750b8863b489d65364e32d";
const FORK_MAKER = "0xf977814e90da44bfa03b6295a0616a897441acec";
const SIX_DECIMAL_UNIT = 10n ** 6n;
const RATE_6_TO_18 = 10n ** 12n;
const TWO_DAYS = 172_800;
const DEFAULT_FORK_BLOCK = 25_905_465;

const erc20Abi = [
  "function approve(address spender,uint256 amount) external returns (bool)",
  "function transfer(address to,uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

const aggregatorAbi = [
  "function decimals() external view returns (uint8)",
  "function latestRoundData() external view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)"
];

const describeFork = process.env.MAINNET_RPC_URL ? describe : describe.skip;

describeFork("Breakwater mainnet fork", function () {
  it("ships and swaps real 6-decimal stablecoins using live Chainlink feeds", async function () {
    const [owner, taker] = await ethers.getSigners();
    const forkBlock = Number(process.env.MAINNET_FORK_BLOCK ?? DEFAULT_FORK_BLOCK);
    expect(await ethers.provider.getBlockNumber()).to.equal(forkBlock);
    await ethers.provider.send("hardhat_impersonateAccount", [FORK_MAKER]);
    await ethers.provider.send("hardhat_setBalance", [FORK_MAKER, "0x56BC75E2D63100000"]);
    const maker = await ethers.getSigner(FORK_MAKER);

    const usdc = await ethers.getContractAt(erc20Abi, USDC);
    const usdt = await ethers.getContractAt(erc20Abi, USDT);
    const usdcFeed = await ethers.getContractAt(aggregatorAbi, USDC_USD_FEED);
    const usdtFeed = await ethers.getContractAt(aggregatorAbi, USDT_USD_FEED);
    expect(await usdc.decimals()).to.equal(6);
    expect(await usdt.decimals()).to.equal(6);
    expect(await usdcFeed.decimals()).to.equal(8);
    expect(await usdtFeed.decimals()).to.equal(8);
    const usdcRound = await usdcFeed.latestRoundData();
    const usdtRound = await usdtFeed.latestRoundData();

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
    const guard = await deployContract("BreakwaterGuard", [
      await router.getAddress(),
      USDC,
      USDT,
      USDC_USD_FEED,
      USDT_USD_FEED,
      TWO_DAYS,
      98n * 10n ** 16n,
      50
    ]) as unknown as BreakwaterGuard;

    const liquidity = 100n * SIX_DECIMAL_UNIT;
    const built = await amm.buildProgram(
      await maker.getAddress(),
      USDC,
      USDT,
      await guard.getAddress(),
      liquidity,
      liquidity,
      RATE_6_TO_18,
      RATE_6_TO_18,
      100n * 10n ** 27n,
      1,
      0
    );
    const order = { maker: built.maker, traits: built.traits, data: built.data };
    const routerAddress = await router.getAddress();
    const aquaAddress = await aqua.getAddress();

    await usdc.connect(maker).approve(aquaAddress, ethers.MaxUint256);
    await usdt.connect(maker).approve(aquaAddress, ethers.MaxUint256);
    await aqua.connect(maker).ship(
      routerAddress,
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address maker, uint256 traits, bytes data)"],
        [order]
      ),
      [USDC, USDT],
      [liquidity, liquidity]
    );

    const amountIn = 10n * SIX_DECIMAL_UNIT;
    await usdt.connect(maker).transfer(await taker.getAddress(), amountIn);
    await usdt.connect(taker).approve(routerAddress, amountIn);
    const takerData = TakerTraitsLib.build({
      taker: await taker.getAddress(),
      isExactIn: true,
      isAToB: false,
      useTransferFromAndAquaPush: true
    });

    const quote = await router.connect(taker).quote.staticCall(order, amountIn, takerData);
    expect(quote.amountOut).to.be.gt(0);
    const orderHash = await router.hash(order);
    const badBefore = await aqua.rawBalances(FORK_MAKER, routerAddress, orderHash, USDC);
    const goodBefore = await aqua.rawBalances(FORK_MAKER, routerAddress, orderHash, USDT);

    const swapTx = await router.connect(taker).swap(order, amountIn, takerData);
    await expect(swapTx).to.emit(router, "Swapped");
    const swapReceipt = await swapTx.wait();

    const badAfter = await aqua.rawBalances(FORK_MAKER, routerAddress, orderHash, USDC);
    const goodAfter = await aqua.rawBalances(FORK_MAKER, routerAddress, orderHash, USDT);
    expect(badAfter.balance).to.equal(badBefore.balance - quote.amountOut);
    expect(goodAfter.balance).to.equal(goodBefore.balance + amountIn);

    console.log("FORK_EVIDENCE", JSON.stringify({
      forkBlock,
      swapTransaction: swapReceipt?.hash,
      usdcFeed: {
        address: USDC_USD_FEED,
        answer: usdcRound.answer.toString(),
        updatedAt: usdcRound.updatedAt.toString(),
        roundId: usdcRound.roundId.toString()
      },
      usdtFeed: {
        address: USDT_USD_FEED,
        answer: usdtRound.answer.toString(),
        updatedAt: usdtRound.updatedAt.toString(),
        roundId: usdtRound.roundId.toString()
      },
      amountIn: amountIn.toString(),
      amountOut: quote.amountOut.toString(),
      aquaBalances: {
        usdcBefore: badBefore.balance.toString(),
        usdcAfter: badAfter.balance.toString(),
        usdtBefore: goodBefore.balance.toString(),
        usdtAfter: goodAfter.balance.toString()
      }
    }));
  });
});
