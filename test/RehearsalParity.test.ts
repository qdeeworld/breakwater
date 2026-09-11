// Differential oracle: real deployed-in-test Aqua/SwapVM order vs browser arithmetic.
import { expect } from "chai";
import { ethers } from "hardhat";
import { spawnSync } from "node:child_process";
import { TakerTraitsLib } from "./utils/SwapVMHelpers";

describe("Rehearsal math versus actual maker order", function () {
  this.timeout(120000);
  it("matches varied allocations, input sizes, fees and discounted exact exits", async () => {
    const [admin, maker] = await ethers.getSigners();
    const deploy = async (n: string, a: any[] = []): Promise<any> => {
      const c = await ethers.deployContract(n, a);
      await c.waitForDeployment();
      return c;
    };
    const aqua = await deploy("Aqua"),
      weth = await deploy("WETHMock");
    const vm = await deploy("AquaSwapVMRouter", [
      aqua.target,
      weth.target,
      admin.address,
      "Rehearsal parity",
      "1",
    ]);
    const asset = await deploy("MockToken", ["Asset", "A", 6]),
      reserve = await deploy("MockToken", ["Reserve", "R", 6]);
    const builder = await deploy("BreakwaterMakerAMM", [aqua.target]);
    const directory = await deploy("BreakwaterPositions", [
      vm.target,
      builder.target,
      asset.target,
      reserve.target,
    ]);
    for (const t of [asset, reserve]) {
      await t.mint(maker.address, 10n ** 25n);
      await t.connect(maker).approve(aqua.target, ethers.MaxUint256);
    }
    const cases: any[] = [];
    for (const [a, r] of [
      ["100", "100"],
      ["100", "250"],
      ["250", "100"],
      ["0.000010", "0.000025"],
      ["1000000000000", "1000000000000"],
    ]) {
      for (const fee of ["10", "30", "100"]) {
        const settings = {
          assetAllocation: ethers.parseUnits(a, 6),
          reserveAllocation: ethers.parseUnits(r, 6),
          feeBps: Number(fee),
          trigger: 980000000000000000n,
          discountBps: 50,
          assetMaxAge: 86400,
          reserveMaxAge: 90000,
        };
        await directory.connect(maker).createDemo(settings);
        const hash = await directory.ownerPositionAt(
          maker.address,
          (await directory.ownerPositionCount(maker.address)) - 1n,
        );
        const p = await directory.position(hash),
          policy: any = await ethers.getContractAt("BreakwaterPolicy", p.policy),
          scenario: any = await ethers.getContractAt("BreakwaterScenario", p.scenario);
        const order = { maker: maker.address, traits: p.orderTraits, data: p.orderData };
        const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(address maker,uint256 traits,bytes data)"],
          [order],
        );
        await aqua
          .connect(maker)
          .ship(
            vm.target,
            encoded,
            [asset.target, reserve.target],
            [settings.assetAllocation, settings.reserveAllocation],
          );
        for (const size of [1n, settings.assetAllocation / 10n || 1n, settings.assetAllocation]) {
          const traits = TakerTraitsLib.build({
            isExactIn: true,
            useTransferFromAndAquaPush: true,
            instructionsArgs: await policy.currentOracleCommitment(),
          });
          let expected: string | undefined;
          try {
            expected = (
              await vm.quote.staticCall(order, asset.target, reserve.target, size, traits)
            ).amountOut.toString();
          } catch {}
          cases.push({ a, r, fee, size: String(size), expected });
        }
        await scenario.connect(maker).setScenario(1);
        const size = settings.assetAllocation / 3n || 1n;
        const traits = TakerTraitsLib.build({
          isExactIn: false,
          useTransferFromAndAquaPush: true,
          instructionsArgs: await policy.currentOracleCommitment(),
        });
        const expected = (
          await vm.quote.staticCall(order, reserve.target, asset.target, size, traits)
        ).amountIn.toString();
        cases.push({ a, r, fee, size: String(size), expected, exit: true });
      }
    }
    const script = `const m=await import('./web/lib/rehearsal-math.ts');const cases=JSON.parse(process.argv[1]);console.log(JSON.stringify(cases.map(c=>{const s=m.settingsFromForm(c.a,c.r,c.fee,'98','50');try{return String(c.exit?m.exitFloor(s,{assetUsd:940000000000000000n,reserveUsd:m.USD,assetAge:0,reserveAge:0},BigInt(c.size)):m.healthyQuote(s,BigInt(c.size)).output)}catch{return null}})));`;
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script, JSON.stringify(cases)],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).equal(0);
    const actual = JSON.parse(result.stdout);
    for (let i = 0; i < cases.length; i++)
      expect(actual[i], JSON.stringify(cases[i])).equal(cases[i].expected ?? null);
    console.log(`REHEARSAL_PARITY: ${cases.length} real-order comparisons`);
  });
});
