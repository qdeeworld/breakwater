// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// © 2026 Breakwater contributors.
// COUNTERFACTUAL: today's pinned Aqua/SwapVM code on historical Ethereum state.
// No live transactions. Direct sale is an optimistic execution-cost baseline,
// NOT yet the complete fee-bearing / delegated stop-loss lifecycle comparison.

import { expect } from "chai";
import { ethers } from "hardhat";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const USDC_FEED = "0x8fffffd4afb6115b954bd326cbe7b4ba576818f6";
const USDT_FEED = "0x3e7d1eab13ad0104d2750b8863b489d65364e32d";
const ETH_FEED = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";
const VENUE = "0xe592427a0aece92de3edee1f18e0157c05861564";
const POOL = "0x7858e59e0c01ea06df3af3d20ac7b0003275d4bf";
const WHALE = "0xf977814e90da44bfa03b6295a0616a897441acec";
const UNIT = 10n ** 6n;
const ERC20 = [
  "function approve(address,uint256) returns(bool)",
  "function transfer(address,uint256) returns(bool)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)"
];
const FEED = ["function decimals() view returns(uint8)", "function latestRoundData() view returns(uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)"];
const ROUTER = ["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256)"];
const POOL_ABI = ["function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)"];
const describeFork = process.env.UNWIND_RPC_URL ? describe : describe.skip;
const blocks = process.env.UNWIND_FORK_BLOCK
  ? [Number(process.env.UNWIND_FORK_BLOCK)] : [16802331, 16803515, 16804701];

describeFork("Breakwater unwind historical fork economics (counterfactual)", function () {
  this.timeout(300_000);

  for (const blockNumber of blocks) {
    it(`compares matched direct/atomic exits at block ${blockNumber}`, async function () {
      await ethers.provider.send("hardhat_reset", [{ forking: {
        jsonRpcUrl: process.env.UNWIND_RPC_URL, blockNumber
      } }]);
      const historical = await ethers.provider.send("eth_getBlockByNumber", [ethers.toQuantity(blockNumber), false]);
      // EDR cannot combine pending local overrides with the remote fork block.
      // Establish one local block before impersonation / native-gas funding.
      await ethers.provider.send("evm_mine", []);
      const [owner, maker, solver] = await ethers.getSigners();
      const deploy = async (name: string, args: any[] = []): Promise<any> => {
        const c = await ethers.deployContract(name, args);
        await c.waitForDeployment();
        return c;
      };
      const usdc: any = await ethers.getContractAt(ERC20, USDC);
      const usdt: any = await ethers.getContractAt(ERC20, USDT);
      const venue: any = await ethers.getContractAt(ROUTER, VENUE);
      const pool: any = await ethers.getContractAt(POOL_ABI, POOL);
      const readFeed = async (address: string) => {
        const feed: any = await ethers.getContractAt(FEED, address);
        const round = await feed.latestRoundData();
        expect(await feed.decimals()).to.equal(8);
        expect(round.answer).to.be.gt(0);
        expect(round.updatedAt).to.be.gt(0);
        expect(round.updatedAt).to.be.lte(BigInt(historical.timestamp));
        expect(BigInt(historical.timestamp) - round.updatedAt).to.be.lte(172_800n);
        expect(round.answeredInRound).to.be.gte(round.roundId);
        return { address, decimals: 8, roundId: round.roundId, answer: round.answer,
          updatedAt: round.updatedAt, answeredInRound: round.answeredInRound };
      };
      const feeds = { usdc: await readFeed(USDC_FEED), usdt: await readFeed(USDT_FEED), eth: await readFeed(ETH_FEED) };
      const ratio = feeds.usdc.answer * 10n ** 18n / feeds.usdt.answer;
      expect(ratio).to.be.lt(980_000_000_000_000_000n);
      const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
      const ratioUp = ceilDiv(feeds.usdc.answer * 10n ** 18n, feeds.usdt.answer);
      const exitPrice = ceilDiv(ratioUp * 9950n, 10000n);
      const historicalGasPrice = BigInt(historical.baseFeePerGas) + 2_000_000_000n;
      const gasInReserve = (units: bigint) => ceilDiv(units * historicalGasPrice * feeds.eth.answer * UNIT,
        10n ** 18n * feeds.usdt.answer);

      // Only local impersonation funds maker inventory. Solver receives no ERC20.
      await ethers.provider.send("hardhat_impersonateAccount", [WHALE]);
      await ethers.provider.send("hardhat_setBalance", [WHALE, "0x56BC75E2D63100000"]);
      const whale = await ethers.getSigner(WHALE);
      const inventory = 100_000n * UNIT;
      expect(await usdc.balanceOf(WHALE)).to.be.gte(inventory);
      await (await usdc.connect(whale).transfer(maker.address, inventory)).wait();
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [WHALE]);
      expect(await usdt.balanceOf(maker.address)).to.equal(0);
      expect(await usdt.balanceOf(solver.address)).to.equal(0);
      const aqua = await deploy("Aqua");
      const weth = await deploy("WETHMock");
      const vm = await deploy("AquaSwapVMRouter", [aqua.target, weth.target, owner.address,
        "Breakwater counterfactual fork", "1.0.2"]);
      const guard = await deploy("BreakwaterGuard", [vm.target, USDC, USDT,
        USDC_FEED, USDT_FEED, 172_800, 980_000_000_000_000_000n, 50]);
      const amm = await deploy("BreakwaterAMM", [aqua.target]);
      const built = await amm.buildProgram(maker.address, USDC, USDT, guard.target,
        inventory, inventory, 10n ** 12n, 10n ** 12n, 100n * 10n ** 27n, 1, 0);
      const order = { maker: built.maker, traits: built.traits, data: built.data };
      const hash = await vm.hash(order);
      await (await usdc.connect(maker).approve(aqua.target, ethers.MaxUint256)).wait();
      // Both branches have standing approvals before the measured transaction.
      const directApproval = await (await usdc.connect(maker).approve(VENUE, ethers.MaxUint256)).wait();
      await (await aqua.connect(maker).ship(vm.target, ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address maker,uint256 traits,bytes data)"], [order]), [USDC, USDT], [inventory, 0])).wait();
      const executor = await deploy("BreakwaterUnwindExecutor", [vm.target, aqua.target,
        VENUE, USDC, USDT, 500, maker.address, hash]);
      const commitment = await guard.currentOracleCommitment();
      const latest = await ethers.provider.getBlock("latest");
      const deadline = latest!.timestamp + 3600;
      const executionTimestamp = latest!.timestamp + 1;
      const setMatchedTime = () => ethers.provider.send("evm_setNextBlockTimestamp", [executionTimestamp]);
      const state = async () => ({
        makerUSDC: await usdc.balanceOf(maker.address), makerUSDT: await usdt.balanceOf(maker.address),
        solverUSDT: await usdt.balanceOf(solver.address),
        executorUSDC: await usdc.balanceOf(executor.target), executorUSDT: await usdt.balanceOf(executor.target),
        virtualUSDC: (await aqua.rawBalances(maker.address, vm.target, hash, USDC)).balance,
        virtualUSDT: (await aqua.rawBalances(maker.address, vm.target, hash, USDT)).balance,
        venueAllowance: await usdc.allowance(executor.target, VENUE),
        aquaAllowance: await usdt.allowance(executor.target, aqua.target),
        poolSlot0: [...await pool.slot0()]
      });
      let snapshot = await ethers.provider.send("evm_snapshot", []);
      const resetCase = async () => {
        expect(await ethers.provider.send("evm_revert", [snapshot])).to.equal(true);
        snapshot = await ethers.provider.send("evm_snapshot", []);
      };
      const results: any[] = [];
      const minedRefusal = async (args: readonly any[], before: any) => {
        const nativeBefore = await ethers.provider.getBalance(solver.address);
        await setMatchedTime();
        await expect(executor.connect(solver).execute(...args, { gasLimit: 1_000_000 }))
          .to.be.revertedWith("Too little received");
        expect(await state()).to.deep.equal(before);
        const nativeAfter = await ethers.provider.getBalance(solver.address);
        expect(nativeAfter).to.be.lt(nativeBefore); // Gas is NOT rolled back.
        const failedBlock = await ethers.provider.send("eth_getBlockByNumber", ["latest", false]);
        const receipt = await ethers.provider.send("eth_getTransactionReceipt", [failedBlock.transactions[0]]);
        expect(receipt.status).to.equal("0x0");
        return { gasUsed: BigInt(receipt.gasUsed), localNativeGasPaidWei: nativeBefore - nativeAfter,
          gasCostAtHistoricalPriceUSDT: gasInReserve(BigInt(receipt.gasUsed)) };
      };
      const sizes = process.env.UNWIND_LARGE_SIZES ? [100, 1000, 10000, 25000, 100000] : [100, 1000, 10000];
      for (const size of sizes) {
        await resetCase();
        const before = await state();
        const amount = BigInt(size) * UNIT;
        const payment = (amount * exitPrice + 10n ** 18n - 1n) / 10n ** 18n;
        const params = { tokenIn: USDC, tokenOut: USDT, fee: 500, recipient: maker.address,
          deadline, amountIn: amount, amountOutMinimum: 0, sqrtPriceLimitX96: 0 };
        const directQuote = await venue.connect(maker).exactInputSingle.staticCall(params);
        await setMatchedTime();
        const directTx = await venue.connect(maker).exactInputSingle(params);
        const directReceipt = await directTx.wait();
        const directAfter = await state();
        expect(directAfter.makerUSDC).to.equal(before.makerUSDC - amount);
        expect(directAfter.makerUSDT).to.equal(before.makerUSDT + directQuote);
        const directGas = directReceipt!.gasUsed;
        await resetCase();
        expect(await state()).to.deep.equal(before);
        const args = [order, amount, payment, 1, deadline, commitment] as const;
        const gross = directQuote - payment;
        const result: any = {
          sizeUSDC: size, selection: size > 10000 ? "exploratory-size-after-initial-failure" : "original-size-grid",
          amount, externalProceeds: directQuote, treasuryRepayment: payment,
          solverGross: gross, directGasUsed: directGas, directGasUSDT: gasInReserve(directGas),
          directTreasuryNetUSDT: directQuote - gasInReserve(directGas),
          treasuryRemainingUSDCIfExecuted: inventory - amount
        };
        if (gross <= 0n) {
          await expect(executor.connect(solver).execute.staticCall(...args)).to.be.revertedWith("Too little received");
          expect(await state()).to.deep.equal(before);
          result.mechanics = "reverted-insufficient-external-proceeds";
          result.economic = "unavailable-even-before-gas";
          result.treasuryActualRemainingUSDC = inventory;
          result.minedRefusal = await minedRefusal(args, before);
        } else {
          expect(await executor.connect(solver).execute.staticCall(...args)).to.deep.equal([payment, gross]);
          await setMatchedTime();
          const receipt = await (await executor.connect(solver).execute(...args)).wait();
          const after = await state();
          expect(after.makerUSDC).to.equal(before.makerUSDC - amount);
          expect(after.makerUSDT).to.equal(before.makerUSDT + payment);
          expect(after.virtualUSDC).to.equal(before.virtualUSDC - amount);
          expect(after.virtualUSDT).to.equal(before.virtualUSDT + payment);
          expect(after.executorUSDC).to.equal(0);
          expect(after.executorUSDT).to.equal(0);
          expect(after.solverUSDT).to.equal(gross);
          expect(after.venueAllowance).to.equal(0);
          expect(after.aquaAllowance).to.equal(0);
          expect(after.poolSlot0).to.deep.equal(directAfter.poolSlot0);
          const gas = receipt!.gasUsed;
          const conservativeGas = (gas * 120n + 99n) / 100n;
          const conservativeCost = gasInReserve(conservativeGas);
          result.mechanics = "atomic-settlement-pass";
          result.executorGasUsed = gas;
          result.executorGasUSDT = gasInReserve(gas);
          result.solverNetUSDT = gross - gasInReserve(gas);
          result.conservativeGasUnits = conservativeGas;
          result.conservativeGasUSDT = conservativeCost;
          result.conservativeSolverNetUSDT = gross - conservativeCost;
          result.economic = gross > conservativeCost ? "positive-with-20-percent-gas-headroom" : "gas-budget-not-covered";
          result.treasuryConcessionVersusDirectNetUSDT = directQuote - gasInReserve(directGas) - payment;
          result.treasuryActualRemainingUSDC = after.makerUSDC;
          // The same executor refuses an exit when the caller requires gas coverage.
          await resetCase();
          const guardedArgs = [order, amount, payment, conservativeCost + 1n, deadline, commitment] as const;
          if (gross > conservativeCost) {
            expect(await executor.connect(solver).execute.staticCall(...guardedArgs)).to.deep.equal([payment, gross]);
          } else {
            await expect(executor.connect(solver).execute.staticCall(...guardedArgs)).to.be.revertedWith("Too little received");
            result.minedRefusal = await minedRefusal(guardedArgs, before);
          }
          expect(await state()).to.deep.equal(before);
        }
        results.push(result);
      }
      console.log("UNWIND_FORK_EVIDENCE", JSON.stringify({
        reconstruction: "Pinned v1.0.2 Aqua/SwapVM self-deployed locally on historical pool/oracle state; Hardhat 2.27.0 default Prague EVM gas rules",
        blockNumber, blockHash: historical.hash, timestamp: Number(BigInt(historical.timestamp)),
        executionTimestamp,
        rpc: ["https://eth-mainnet.public.blastapi.io", "https://eth.drpc.org"].includes(process.env.UNWIND_RPC_URL!)
          ? process.env.UNWIND_RPC_URL : "user-supplied archive endpoint (redacted)",
        baseFeePerGas: historical.baseFeePerGas,
        priorityFeeWei: "2000000000", feeds, initialMakerUSDC: inventory, initialMakerUSDT: "0",
        initialSolverUSDT: "0", initialExecutorUSDT: "0", initialExecutorUSDC: "0",
        venue: VENUE, pool: POOL, fee: 500, discountBps: 50,
        venueCodeHash: ethers.keccak256(await ethers.provider.getCode(VENUE)),
        executorCodeHash: ethers.keccak256(await ethers.provider.getCode(executor.target)),
        setup: { directStandingApprovalGas: directApproval!.gasUsed,
          excluded: "Deployments, setup, all standing approvals excluded from both execution-only branches; callback approvals included in executor gas" },
        limitations: ["Not an historical transaction", "No full healthy earning lifecycle or delegated direct keeper yet",
          "Direct branch is only standalone swap-cost lower bound: it leaves Aqua virtual inventory unchanged, not a complete safe stop-loss",
          "Gross-only mechanics transactions may lose money; rational availability uses gas-covering minimum surplus",
          "Gas costs re-priced at pinned base fee + 2 gwei, not local post-deployment block fee",
          "No inclusion guarantee, priority competition, MEV or operator delay assumption", "No claim of better treasury proceeds"],
        results
      }, (_, value) => typeof value === "bigint" ? value.toString() : value));
    });
  }
});
