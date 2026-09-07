// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// © 2026 Breakwater contributors.
// LOCAL MECHANICS ONLY: mock prices, standard mock ERC20s and funded mock venue.
// These tests provide no evidence of real-market economics or treasury advantage.

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const UNIT = 10n ** 6n;
const AMOUNT = 100n * UNIT;
const PAYMENT = 93_530_000n; // 100 impaired * 0.94 oracle price * (1 - 50 bps).
const PROCEEDS = 94n * UNIT;
const SURPLUS = PROCEEDS - PAYMENT;
const MIN_SURPLUS = 100_000n;
const FEE = 100;

async function fixture() {
  const [deployer, maker, solver, secondSolver] = await ethers.getSigners();
  const deploy = async (name: string, args: any[] = []): Promise<any> => {
    const contract = await ethers.deployContract(name, args);
    await contract.waitForDeployment();
    return contract;
  };
  const aqua = await deploy("Aqua");
  const weth = await deploy("WETHMock");
  const router = await deploy("AquaSwapVMRouter", [aqua.target, weth.target, deployer.address,
    "Breakwater local mechanics", "1.0.2"]);
  const bad = await deploy("MockToken", ["Mock impaired", "mBAD", 6]);
  const reserve = await deploy("MockToken", ["Mock reserve", "mRES", 6]);
  const badFeed = await deploy("MockPriceFeed", [8, 94_000_000]);
  const reserveFeed = await deploy("MockPriceFeed", [8, 100_000_000]);
  const guard = await deploy("BreakwaterGuard", [router.target, bad.target, reserve.target,
    badFeed.target, reserveFeed.target, 86_400, 980_000_000_000_000_000n, 50]);
  const amm = await deploy("BreakwaterAMM", [aqua.target]);
  const liquidity = 1_000n * UNIT;
  const built = await amm.buildProgram(maker.address, bad.target, reserve.target, guard.target,
    liquidity, liquidity, 10n ** 12n, 10n ** 12n, 100n * 10n ** 27n, 1, 0);
  const order = { maker: built.maker, traits: built.traits, data: built.data };
  const hash = await router.hash(order);
  await bad.mint(maker.address, liquidity);
  await reserve.mint(maker.address, liquidity);
  await bad.connect(maker).approve(aqua.target, ethers.MaxUint256);
  await reserve.connect(maker).approve(aqua.target, ethers.MaxUint256);
  await aqua.connect(maker).ship(router.target, ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address maker,uint256 traits,bytes data)"], [order]),
    [bad.target, reserve.target], [liquidity, liquidity]);
  const venue = await deploy("MockUnwindVenue", [bad.target, reserve.target, FEE, PROCEEDS]);
  await reserve.mint(venue.target, 1_000_000n * UNIT);
  const executor = await deploy("BreakwaterUnwindExecutor", [router.target, aqua.target,
    venue.target, bad.target, reserve.target, FEE, maker.address, hash]);
  const commitment = await guard.currentOracleCommitment();
  const deadline = (await time.latest()) + 3_600;
  const args = [order, AMOUNT, PAYMENT, MIN_SURPLUS, deadline, commitment] as const;
  const execute = () => executor.connect(solver).execute(...args);
  const state = async () => ({
    makerBad: await bad.balanceOf(maker.address),
    makerReserve: await reserve.balanceOf(maker.address),
    makerBadVirtual: [...await aqua.rawBalances(maker.address, router.target, hash, bad.target)],
    makerReserveVirtual: [...await aqua.rawBalances(maker.address, router.target, hash, reserve.target)],
    executorBad: await bad.balanceOf(executor.target),
    executorReserve: await reserve.balanceOf(executor.target),
    venueBad: await bad.balanceOf(venue.target),
    venueReserve: await reserve.balanceOf(venue.target),
    solverBad: await bad.balanceOf(solver.address),
    solverReserve: await reserve.balanceOf(solver.address),
    makerBadAllowance: await bad.allowance(maker.address, aqua.target),
    makerReserveAllowance: await reserve.allowance(maker.address, aqua.target),
    venueAllowance: await bad.allowance(executor.target, venue.target),
    aquaAllowance: await reserve.allowance(executor.target, aqua.target),
    venueCalls: await venue.calls()
  });
  return { deployer, maker, solver, secondSolver, aqua, router, bad, reserve, badFeed,
    reserveFeed, guard, venue, executor, order, hash, commitment, deadline, args, execute, state };
}

describe("BreakwaterUnwindExecutor local mechanics (not economic evidence)", function () {
  it("allows a second local signer to clear with zero executor token capital", async function () {
    const f = await loadFixture(fixture);
    const before = await f.state();
    expect(before.executorBad).to.equal(0);
    expect(before.executorReserve).to.equal(0);
    expect(await f.executor.connect(f.secondSolver).execute.staticCall(...f.args))
      .to.deep.equal([PAYMENT, SURPLUS]);
    await expect(f.executor.connect(f.secondSolver).execute(...f.args))
      .to.emit(f.executor, "Unwound").withArgs(f.hash, f.secondSolver.address, AMOUNT, PAYMENT, SURPLUS);
    const after = await f.state();
    expect(after.makerBad).to.equal(before.makerBad - AMOUNT);
    expect(after.makerReserve).to.equal(before.makerReserve + PAYMENT);
    expect(after.makerBadVirtual[0]).to.equal(before.makerBadVirtual[0] - AMOUNT);
    expect(after.makerReserveVirtual[0]).to.equal(before.makerReserveVirtual[0] + PAYMENT);
    expect(after.executorBad).to.equal(0);
    expect(after.executorReserve).to.equal(0);
    expect(after.venueBad).to.equal(before.venueBad + AMOUNT);
    expect(after.venueReserve).to.equal(before.venueReserve - PROCEEDS);
    expect(after.venueAllowance).to.equal(0);
    expect(after.aquaAllowance).to.equal(0);
    expect(await f.reserve.balanceOf(f.secondSolver.address)).to.equal(SURPLUS);
    expect(await f.reserve.balanceOf(f.solver.address)).to.equal(0);
    expect(await f.reserve.balanceOf(f.deployer.address)).to.equal(0);
  });

  it("preserves unsolicited balances and pays only new proceeds", async function () {
    const f = await loadFixture(fixture);
    await f.bad.mint(f.executor.target, 23n * UNIT);
    await f.reserve.mint(f.executor.target, 400n * UNIT);
    await expect(f.execute()).to.emit(f.executor, "Unwound")
      .withArgs(f.hash, f.solver.address, AMOUNT, PAYMENT, SURPLUS);
    expect(await f.bad.balanceOf(f.executor.target)).to.equal(23n * UNIT);
    expect(await f.reserve.balanceOf(f.executor.target)).to.equal(400n * UNIT);
    expect(await f.reserve.balanceOf(f.solver.address)).to.equal(SURPLUS);
  });

  it("cannot subsidize insufficient venue proceeds with donated reserve; all effects roll back", async function () {
    const f = await loadFixture(fixture);
    await f.reserve.mint(f.executor.target, 50_000n * UNIT);
    await f.venue.setEnforceMinimum(false); // Adversarial venue ignores its own minimum.
    await f.venue.setProceeds(PAYMENT - 1n);
    const before = await f.state();
    await expect(f.execute()).to.be.revertedWithCustomError(f.executor, "InsufficientProceeds");
    expect(await f.state()).to.deep.equal(before);
    await f.venue.setProceeds(PROCEEDS);
    await expect(f.execute()).to.emit(f.executor, "Unwound");
    expect(await f.reserve.balanceOf(f.executor.target)).to.equal(50_000n * UNIT);
  });

  it("rejects a min-surplus one base unit above achievable proceeds", async function () {
    const f = await loadFixture(fixture);
    const before = await f.state();
    await expect(f.executor.connect(f.solver).execute(f.order, AMOUNT, PAYMENT, SURPLUS + 1n,
      f.deadline, f.commitment)).to.be.revertedWithCustomError(f.venue, "TooLittleReceived");
    expect(await f.state()).to.deep.equal(before);
  });

  it("rejects max payment one base unit below the guard price before touching the venue", async function () {
    const f = await loadFixture(fixture);
    const before = await f.state();
    await expect(f.executor.connect(f.solver).execute(f.order, AMOUNT, PAYMENT - 1n, MIN_SURPLUS,
      f.deadline, f.commitment)).to.be.reverted;
    expect(await f.state()).to.deep.equal(before);
    await expect(f.execute()).to.emit(f.executor, "Unwound");
  });

  it("rejects an outdated oracle commitment and can execute with a refreshed commitment", async function () {
    const f = await loadFixture(fixture);
    await f.badFeed.setAnswer(94_000_000); // Same price, new round must still invalidate commitment.
    const before = await f.state();
    await expect(f.execute()).to.be.revertedWithCustomError(f.guard, "OracleCommitmentMismatch");
    expect(await f.state()).to.deep.equal(before);
    await expect(f.executor.connect(f.solver).execute(f.order, AMOUNT, PAYMENT, MIN_SURPLUS,
      f.deadline, await f.guard.currentOracleCommitment())).to.emit(f.executor, "Unwound");
  });

  it("rejects an expired deadline without altering balances", async function () {
    const f = await loadFixture(fixture);
    const before = await f.state();
    await expect(f.executor.connect(f.solver).execute(f.order, AMOUNT, PAYMENT, MIN_SURPLUS,
      (await time.latest()) - 1, f.commitment)).to.be.revertedWithCustomError(f.executor, "InvalidRequest");
    expect(await f.state()).to.deep.equal(before);
  });

  for (const [label, amount, payment, minimum] of [
    ["zero impaired amount", 0n, PAYMENT, MIN_SURPLUS],
    ["zero max payment", AMOUNT, 0n, MIN_SURPLUS],
    ["zero surplus requirement", AMOUNT, PAYMENT, 0n]
  ] as const) {
    it(`rejects ${label}`, async function () {
      const f = await loadFixture(fixture);
      await expect(f.executor.connect(f.solver).execute(f.order, amount, payment, minimum,
        f.deadline, f.commitment)).to.be.revertedWithCustomError(f.executor, "InvalidRequest");
    });
  }

  it("rejects a changed maker and a changed order program", async function () {
    const f = await loadFixture(fixture);
    for (const order of [
      { ...f.order, maker: f.solver.address },
      { ...f.order, data: f.order.data + "00" }
    ]) {
      await expect(f.executor.connect(f.solver).execute(order, AMOUNT, PAYMENT, MIN_SURPLUS,
        f.deadline, f.commitment)).to.be.revertedWithCustomError(f.executor, "InvalidRequest");
    }
  });

  it("fails on insufficient virtual impaired inventory", async function () {
    const f = await loadFixture(fixture);
    const before = await f.state();
    await expect(f.executor.connect(f.solver).execute(f.order, 1_001n * UNIT, 2_000n * UNIT,
      MIN_SURPLUS, f.deadline, f.commitment))
      .to.be.revertedWithCustomError(f.guard, "InsufficientBadTokenLiquidity");
    expect(await f.state()).to.deep.equal(before);
  });

  it("fails on revoked maker allowance and is reusable after repair", async function () {
    const f = await loadFixture(fixture);
    await f.bad.connect(f.maker).approve(f.aqua.target, 0);
    const before = await f.state();
    await expect(f.execute()).to.be.revertedWithCustomError(f.aqua, "SafeTransferFromFailed");
    expect(await f.state()).to.deep.equal(before);
    await f.bad.connect(f.maker).approve(f.aqua.target, AMOUNT);
    await expect(f.execute()).to.emit(f.executor, "Unwound");
  });

  it("fails when another use depletes maker wallet despite remaining Aqua virtual inventory", async function () {
    const f = await loadFixture(fixture);
    await f.bad.connect(f.maker).transfer(f.deployer.address, 1_000n * UNIT - AMOUNT + 1n);
    const before = await f.state();
    await expect(f.execute()).to.be.revertedWithCustomError(f.aqua, "SafeTransferFromFailed");
    expect(await f.state()).to.deep.equal(before);
  });

  it("fails after maker cancellation/docking", async function () {
    const f = await loadFixture(fixture);
    await f.aqua.connect(f.maker).dock(f.router.target, f.hash, [f.bad.target, f.reserve.target]);
    const before = await f.state();
    await expect(f.execute()).to.be.revertedWithCustomError(f.aqua, "SafeBalancesForTokenNotInActiveStrategy");
    expect(await f.state()).to.deep.equal(before);
  });

  it("rejects unauthenticated callbacks and disabled pre-output callbacks", async function () {
    const f = await loadFixture(fixture);
    const callbackArgs = [f.maker.address, f.executor.target, f.reserve.target, f.bad.target,
      PAYMENT, AMOUNT, f.hash, "0x"];
    const before = await f.state();
    await expect(f.executor.preTransferInCallback(...callbackArgs))
      .to.be.revertedWithCustomError(f.executor, "InvalidCallback");
    await expect(f.executor.preTransferOutCallback(...callbackArgs))
      .to.be.revertedWithCustomError(f.executor, "InvalidCallback");
    expect(await f.state()).to.deep.equal(before);
  });

  it("rejects callback from the actual router address when no execution is active", async function () {
    const f = await loadFixture(fixture);
    // Local Hardhat impersonation only: exercises idle-phase authentication, no live signer.
    await ethers.provider.send("hardhat_setBalance", [f.router.target, "0x56BC75E2D63100000"]);
    await ethers.provider.send("hardhat_impersonateAccount", [f.router.target]);
    try {
      const routerSigner = await ethers.getSigner(f.router.target);
      await expect(f.executor.connect(routerSigner).preTransferInCallback(f.maker.address,
        f.executor.target, f.reserve.target, f.bad.target, PAYMENT, AMOUNT, f.hash, "0x"))
        .to.be.revertedWithCustomError(f.executor, "InvalidCallback");
    } finally {
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [f.router.target]);
    }
    await expect(f.execute()).to.emit(f.executor, "Unwound");
  });

  it("rolls back a failing external route and remains usable", async function () {
    const f = await loadFixture(fixture);
    await f.venue.setFailure(true);
    const before = await f.state();
    await expect(f.execute()).to.be.revertedWithCustomError(f.venue, "DeliberateFailure");
    expect(await f.state()).to.deep.equal(before);
    await f.venue.setFailure(false);
    await expect(f.execute()).to.emit(f.executor, "Unwound");
  });

  it("rejects partial impaired-token consumption even when repayment proceeds are sufficient", async function () {
    const f = await loadFixture(fixture);
    await f.venue.setConsumptionBps(9_999);
    const before = await f.state();
    await expect(f.execute()).to.be.revertedWithCustomError(f.executor, "InvalidBalanceDelta");
    expect(await f.state()).to.deep.equal(before);
  });

  it("rejects fabricated router return amounts", async function () {
    const f = await loadFixture(fixture);
    await f.venue.setReportedProceeds(PROCEEDS + 1n);
    const before = await f.state();
    await expect(f.execute()).to.be.revertedWithCustomError(f.executor, "InvalidBalanceDelta");
    expect(await f.state()).to.deep.equal(before);
  });

  for (const changedOrder of [false, true]) {
    it(`rejects nested execute ${changedOrder ? "with a different order" : "with the same order"} before context replacement`, async function () {
      const f = await loadFixture(fixture);
      const order = changedOrder ? { ...f.order, data: f.order.data + "00" } : f.order;
      const encoded = f.executor.interface.encodeFunctionData("execute", [order, AMOUNT,
        PAYMENT, MIN_SURPLUS, f.deadline, f.commitment]);
      await f.venue.setReentry(f.executor.target, encoded);
      await expect(f.execute()).to.emit(f.executor, "Unwound");
      expect(await f.venue.reentrySucceeded()).to.equal(false);
      expect(f.executor.interface.parseError(await f.venue.reentryResult())?.name).to.equal("ExecutionActive");
      expect(await f.reserve.balanceOf(f.solver.address)).to.equal(SURPLUS);
      expect(await f.venue.calls()).to.equal(1);
    });
  }

  it("rejects an attempted second callback while selling", async function () {
    const f = await loadFixture(fixture);
    const encoded = f.executor.interface.encodeFunctionData("preTransferInCallback", [
      f.maker.address, f.executor.target, f.reserve.target, f.bad.target, PAYMENT, AMOUNT, f.hash, "0x"]);
    await f.venue.setReentry(f.executor.target, encoded);
    await expect(f.execute()).to.emit(f.executor, "Unwound");
    expect(await f.venue.reentrySucceeded()).to.equal(false);
    expect(f.executor.interface.parseError(await f.venue.reentryResult())?.name).to.equal("InvalidCallback");
  });

  it("clears again after a successful execution without stale locks or allowances", async function () {
    const f = await loadFixture(fixture);
    await f.execute();
    await f.execute();
    expect(await f.reserve.balanceOf(f.solver.address)).to.equal(2n * SURPLUS);
    expect(await f.bad.balanceOf(f.executor.target)).to.equal(0);
    expect(await f.reserve.balanceOf(f.executor.target)).to.equal(0);
    expect(await f.bad.allowance(f.executor.target, f.venue.target)).to.equal(0);
    expect(await f.reserve.allowance(f.executor.target, f.aqua.target)).to.equal(0);
    expect(await f.venue.calls()).to.equal(2);
  });
});
