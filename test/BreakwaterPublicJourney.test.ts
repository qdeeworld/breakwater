// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// © 2026 Breakwater contributors.

import "@nomicfoundation/hardhat-chai-matchers";
import { expect } from "chai";

import deployBreakwaterPublic from "../deploy/deploy-breakwater-public";
import { TakerTraitsLib } from "./utils/SwapVMHelpers";

const hre = require("hardhat");
const { deployments, ethers, getNamedAccounts } = hre;

const TOKEN_UNIT = 10n ** 6n;
const POSITION_LIQUIDITY = 1_000_000n * TOKEN_UNIT;
const RATE_6_TO_18 = 10n ** 12n;
const LINEAR_WIDTH = 100n * 10n ** 27n;
const ORDER_SALT = 20_260_904;

describe("Breakwater public taker journey", function () {
  it("commissions an immutable stressed market and settles its unwind", async function () {
    await deployments.fixture(["BreakwaterPublic"]);
    const { deployer } = await getNamedAccounts();
    const [, taker] = await ethers.getSigners();
    const takerAddress = await taker.getAddress();

    const aquaDeployment = await deployments.get("BreakwaterPublicAqua");
    const routerDeployment = await deployments.get("BreakwaterPublicRouter");
    const ammDeployment = await deployments.get("BreakwaterPublicAMM");
    const guardDeployment = await deployments.get("BreakwaterPublicGuard");
    const badDeployment = await deployments.get("BreakwaterDemoBadToken");
    const goodDeployment = await deployments.get("BreakwaterDemoGoodToken");
    const badFeedDeployment = await deployments.get("BreakwaterDemoBadFeed");
    const goodFeedDeployment = await deployments.get("BreakwaterDemoGoodFeed");

    const aqua = await ethers.getContractAt("Aqua", aquaDeployment.address);
    const router = await ethers.getContractAt("AquaSwapVMRouter", routerDeployment.address);
    const amm = await ethers.getContractAt("BreakwaterAMM", ammDeployment.address);
    const guard = await ethers.getContractAt("BreakwaterGuard", guardDeployment.address);
    const bad = await ethers.getContractAt("DemoFaucetToken", badDeployment.address);
    const good = await ethers.getContractAt("DemoFaucetToken", goodDeployment.address);
    const badFeed = await ethers.getContractAt("DemoPriceFeed", badFeedDeployment.address);
    const goodFeed = await ethers.getContractAt("DemoPriceFeed", goodFeedDeployment.address);

    const badRound = await badFeed.latestRoundData();
    const goodRound = await goodFeed.latestRoundData();
    expect(badRound[1]).to.equal(94_000_000n);
    expect(goodRound[1]).to.equal(100_000_000n);
    expect(badFeed.interface.getFunction("setAnswer")).to.equal(null);
    expect(good.interface.getFunction("mint")).to.equal(null);
    expect(await good.FAUCET_AMOUNT()).to.equal(1_000n * TOKEN_UNIT);
    expect(await good.FAUCET_SUPPLY_CAP()).to.equal(100_000n * TOKEN_UNIT);

    const built = await amm.buildProgram(
      deployer,
      badDeployment.address,
      goodDeployment.address,
      guardDeployment.address,
      POSITION_LIQUIDITY,
      POSITION_LIQUIDITY,
      RATE_6_TO_18,
      RATE_6_TO_18,
      LINEAR_WIDTH,
      ORDER_SALT,
      0,
    );
    const order = { maker: built.maker, traits: built.traits, data: built.data };
    const orderHash = await router.hash(order);
    const badBefore = await aqua.rawBalances(
      deployer,
      routerDeployment.address,
      orderHash,
      badDeployment.address,
    );
    expect(badBefore.balance).to.equal(POSITION_LIQUIDITY);

    const amountIn = 10n * TOKEN_UNIT;
    await good.connect(taker).claim();
    await expect(good.connect(taker).claim())
      .to.be.revertedWithCustomError(good, "FaucetAlreadyClaimed")
      .withArgs(takerAddress);
    const latestBlock = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latestBlock.timestamp + 600);
    const commitment = await guard.currentOracleCommitment();
    const discoveryTraits = TakerTraitsLib.build({
      isExactIn: true,
      threshold: 1n,
      deadline,
      useTransferFromAndAquaPush: true,
      instructionsArgs: commitment,
    });
    const discoveryQuote = await router.connect(taker).quote.staticCall(
      order,
      goodDeployment.address,
      badDeployment.address,
      amountIn,
      discoveryTraits,
    );
    const minimumOut = discoveryQuote.amountOut * 9_950n / 10_000n;
    const finalTraits = TakerTraitsLib.build({
      isExactIn: true,
      threshold: minimumOut,
      deadline,
      useTransferFromAndAquaPush: true,
      instructionsArgs: commitment,
    });
    const finalQuote = await router.connect(taker).quote.staticCall(
      order,
      goodDeployment.address,
      badDeployment.address,
      amountIn,
      finalTraits,
    );

    await good.connect(taker).approve(routerDeployment.address, amountIn);
    await expect(
      router.connect(taker).swap(
        order,
        goodDeployment.address,
        badDeployment.address,
        amountIn,
        finalTraits,
      ),
    ).to.emit(router, "Swapped");

    const badAfter = await aqua.rawBalances(
      deployer,
      routerDeployment.address,
      orderHash,
      badDeployment.address,
    );
    expect(badAfter.balance).to.equal(badBefore.balance - finalQuote.amountOut);
    expect(await bad.balanceOf(takerAddress)).to.equal(finalQuote.amountOut);

    await deployBreakwaterPublic(hre);
    const badReplenished = await aqua.rawBalances(
      deployer,
      routerDeployment.address,
      orderHash,
      badDeployment.address,
    );
    expect(badReplenished.balance).to.equal(POSITION_LIQUIDITY);
  });

  it("hard-caps public faucet issuance across wallets", async function () {
    const [owner, first, second, third] = await ethers.getSigners();
    const tokenFactory = await ethers.getContractFactory("DemoFaucetToken", owner);
    const faucetAmount = 1_000n * TOKEN_UNIT;
    const token = await tokenFactory.deploy(
      "Bounded Demo USD",
      "dUSD",
      6,
      0,
      faucetAmount,
      faucetAmount * 2n,
    );

    await token.connect(first).claim();
    await token.connect(second).claim();
    await expect(token.connect(third).claim())
      .to.be.revertedWithCustomError(token, "FaucetExhausted")
      .withArgs(faucetAmount, 0);
  });
});
