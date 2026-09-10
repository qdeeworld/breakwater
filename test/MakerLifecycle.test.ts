// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// Controlled local fixtures, not external-user or market evidence.
import {expect} from "chai";
import {ethers} from "hardhat";
import {loadFixture,time} from "@nomicfoundation/hardhat-network-helpers";
import {TakerTraitsLib} from "./utils/SwapVMHelpers";

async function fixture(){
  const [admin,maker,taker,other] = await ethers.getSigners();
  const deploy=async(name:string,args:any[]=[]):Promise<any>=>{
    const c=await ethers.deployContract(name,args);await c.waitForDeployment();return c;
  };
  const aqua=await deploy("Aqua"),weth=await deploy("WETHMock");
  const vm=await deploy("AquaSwapVMRouter",[aqua.target,weth.target,admin.address,"Maker lifecycle","1.0.2"]);
  const asset=await deploy("MockToken",["Sample asset","ASSET",6]);
  const reserve=await deploy("MockToken",["Sample reserve","RES",6]);
  const builder=await deploy("BreakwaterMakerAMM",[aqua.target]);
  const directory=await deploy("BreakwaterPositions",[vm.target,builder.target,asset.target,reserve.target]);
  const settings={assetAllocation:1_000_000_000n,reserveAllocation:1_000_000_000n,feeBps:30,
    trigger:980_000_000_000_000_000n,discountBps:50,assetMaxAge:86400,reserveMaxAge:90000};
  await directory.connect(maker).createDemo(settings);
  const hash=await directory.ownerPositionAt(maker.address,0);
  const p=await directory.position(hash);
  const policy=await ethers.getContractAt("BreakwaterPolicy",p.policy);
  const scenario:any=await ethers.getContractAt("BreakwaterScenario",p.scenario);
  const order={maker:p.owner,traits:p.orderTraits,data:p.orderData};
  const strategy=ethers.AbiCoder.defaultAbiCoder().encode(["tuple(address maker,uint256 traits,bytes data)"],[order]);
  const ship=async()=>aqua.connect(maker).ship(vm.target,strategy,[asset.target,reserve.target],
    [settings.assetAllocation,settings.reserveAllocation]);
  for(const t of [asset,reserve]){
    await t.mint(maker.address,settings.assetAllocation);await t.connect(maker).approve(aqua.target,ethers.MaxUint256);
    await t.mint(taker.address,100_000_000n);await t.connect(taker).approve(vm.target,ethers.MaxUint256);
  }
  const args=async(assetIn=true,exactIn=true,firstIn=false,amount=1_000_001n)=>[
    order,assetIn?asset.target:reserve.target,assetIn?reserve.target:asset.target,amount,
    TakerTraitsLib.build({isExactIn:exactIn,isFirstTransferFromTaker:firstIn,
      useTransferFromAndAquaPush:true,instructionsArgs:await policy.currentOracleCommitment()})
  ] as const;
  return {admin,maker,taker,other,deploy,aqua,vm,asset,reserve,builder,directory,settings,hash,p,policy,scenario,order,strategy,ship,args};
}

describe("Treasury-owned fee-bearing lifecycle",()=>{
  it("creates for caller without custody or ship authority; owner can ship and cancel",async()=>{
    const f=await loadFixture(fixture);
    expect(f.p.owner).to.equal(f.maker.address);
    expect(await f.directory.ownerPositionCount(f.maker.address)).to.equal(1);
    expect(await f.asset.balanceOf(f.directory.target)).to.equal(0);
    expect((await f.aqua.rawBalances(f.maker.address,f.vm.target,f.hash,f.asset.target))[1]).to.equal(0);
    await f.ship();
    const balancesBefore=[await f.asset.balanceOf(f.maker.address),await f.reserve.balanceOf(f.maker.address)];
    await expect(f.aqua.connect(f.other).dock(f.vm.target,f.hash,[f.asset.target,f.reserve.target])).to.be.reverted;
    await f.aqua.connect(f.maker).dock(f.vm.target,f.hash,[f.asset.target,f.reserve.target]);
    expect((await f.aqua.rawBalances(f.maker.address,f.vm.target,f.hash,f.asset.target))[1]).to.equal(255);
    expect([await f.asset.balanceOf(f.maker.address),await f.reserve.balanceOf(f.maker.address)]).to.deep.equal(balancesBefore);
    await expect(f.vm.connect(f.taker).swap(...await f.args())).to.be.reverted;
  });

  for(const exactIn of [true,false])for(const firstIn of [true,false])for(const assetIn of [true,false]){
    it(`accounts one settled healthy fee: exactIn=${exactIn}, inputFirst=${firstIn}, assetIn=${assetIn}`,async()=>{
      const f=await loadFixture(fixture);await f.ship();
      const args=await f.args(assetIn,exactIn,firstIn);
      const q=await f.vm.quote.staticCall(...args);
      expect((await f.directory.accounting(f.hash)).healthyTrades).to.equal(0);
      const token=assetIn?f.asset:f.reserve;
      const before=await token.balanceOf(f.maker.address);
      const fee=(q.amountIn*30n+9999n)/10000n;
      await expect(f.vm.connect(f.taker).swap(...args)).to.emit(f.directory,"HealthyFeeEarned")
        .withArgs(f.hash,token.target,fee,q.amountIn);
      expect(await token.balanceOf(f.maker.address)-before).to.equal(q.amountIn);
      const a=await f.directory.accounting(f.hash);
      expect(a.healthyTrades).to.equal(1);
      expect(assetIn?a.assetFees:a.reserveFees).to.equal(fee);
      expect(assetIn?a.reserveFees:a.assetFees).to.equal(0);
      expect(a.exitTrades).to.equal(0);
      // A second settlement must not inherit the first one's boundary marker.
      await f.vm.connect(f.taker).swap(...await f.args(assetIn,exactIn,firstIn));
      expect((await f.directory.accounting(f.hash)).healthyTrades).to.equal(2);
    });
  }

  it("same order earns, refuses accumulation, exits without healthy fees, halts, resumes and cancels",async()=>{
    const f=await loadFixture(fixture);await f.ship();
    await f.vm.connect(f.taker).swap(...await f.args());
    const earned=await f.directory.accounting(f.hash);
    await f.scenario.connect(f.maker).setScenario(1);
    await expect(f.vm.quote.staticCall(...await f.args())).to.be.revertedWithCustomError(f.policy,"ToxicDirectionBlocked");
    const before=await f.aqua.rawBalances(f.maker.address,f.vm.target,f.hash,f.asset.target);
    const exit=await f.args(false),q=await f.vm.quote.staticCall(...exit);
    await expect(f.vm.connect(f.taker).swap(...exit)).to.emit(f.directory,"ExitSettled").withArgs(f.hash,q.amountOut,q.amountIn);
    const a=await f.directory.accounting(f.hash);
    expect(a.assetFees).to.equal(earned.assetFees);expect(a.reserveFees).to.equal(earned.reserveFees);
    expect(a.assetExited).to.equal(q.amountOut);expect(a.reserveProceeds).to.equal(q.amountIn);
    expect((await f.aqua.rawBalances(f.maker.address,f.vm.target,f.hash,f.asset.target))[0]).to.equal(before[0]-q.amountOut);
    for(const state of [2,3]){
      await f.scenario.connect(f.maker).setScenario(state);
      for(const direction of [true,false])await expect(f.vm.quote.staticCall(...await f.args(direction)))
        .to.be.revertedWithCustomError(f.policy,"UnsafeReserve");
    }
    await f.scenario.connect(f.maker).setScenario(0);
    await f.vm.connect(f.taker).swap(...await f.args(false));
    expect(await f.vm.hash(f.order)).to.equal(f.hash);
    await f.aqua.connect(f.maker).dock(f.vm.target,f.hash,[f.asset.target,f.reserve.target]);
  });

  it("does not count failed settlements or permit forged hook accounting",async()=>{
    const f=await loadFixture(fixture);await f.ship();
    await expect(f.directory.preTransferIn(f.maker.address,f.taker.address,f.asset.target,f.reserve.target,
      1_000_000,999_000,f.hash,"0x","0x")).to.be.revertedWithCustomError(f.directory,"UnauthorizedHook");
    await f.asset.connect(f.taker).approve(f.vm.target,0);
    await expect(f.vm.connect(f.taker).swap(...await f.args())).to.be.reverted;
    expect((await f.directory.accounting(f.hash)).healthyTrades).to.equal(0);
  });

  it("only owner changes its sample feeds; observations expire instead of refreshing on reads",async()=>{
    const f=await loadFixture(fixture);await f.ship();
    await expect(f.scenario.connect(f.other).setScenario(1)).to.be.revertedWith("Only position owner");
    await time.increase(86401);
    await expect(f.policy.snapshot()).to.be.revertedWithCustomError(f.policy,"StaleFeed");
    await f.scenario.connect(f.maker).setScenario(0);
    expect((await f.policy.snapshot()).healthy).to.equal(true);
  });

  it("enforces each feed's own age and rejects unsupported policy settings",async()=>{
    const f=await loadFixture(fixture);
    const af=await f.deploy("MockPriceFeed",[8,100_000_000]),rf=await f.deploy("MockPriceFeed",[8,100_000_000]);
    await f.directory.connect(f.maker).create({...f.settings,assetMaxAge:3600,reserveMaxAge:1800},af.target,rf.target);
    const h=await f.directory.ownerPositionAt(f.maker.address,1),p=await f.directory.position(h);
    const policy=await ethers.getContractAt("BreakwaterPolicy",p.policy);
    await time.increase(1801);
    await expect(policy.snapshot()).to.be.revertedWithCustomError(policy,"StaleFeed");
    await rf.setAnswer(100_000_000);expect((await policy.snapshot()).healthy).to.equal(true);
    await expect(f.directory.connect(f.maker).createDemo({...f.settings,discountBps:101})).to.be.reverted;
    await expect(f.directory.connect(f.maker).createDemo({...f.settings,feeBps:101})).to.be.reverted;
    await expect(f.directory.connect(f.maker).createDemo({...f.settings,trigger:970_000_000_000_000_000n})).to.be.reverted;
  });

  it("retains optional atomic clearing under the same order's existing Aqua permissions",async()=>{
    const f=await loadFixture(fixture);await f.ship();
    await f.vm.connect(f.taker).swap(...await f.args());
    const before=await f.directory.accounting(f.hash);
    await f.scenario.connect(f.maker).setScenario(1);
    // Invented route proceeds test callback compatibility only, not economics.
    const venue=await f.deploy('MockUnwindVenue',[f.asset.target,f.reserve.target,100,94_000_000n]);
    await f.reserve.mint(venue.target,200_000_000n);
    const executor=await f.deploy('BreakwaterUnwindExecutor',[f.vm.target,f.aqua.target,venue.target,
      f.asset.target,f.reserve.target,100,f.maker.address,f.hash]);
    expect(await f.reserve.balanceOf(executor.target)).to.equal(0);
    await expect(executor.connect(f.other).execute(f.order,100_000_000n,93_530_000n,100_000n,
      (await time.latest())+600,await f.policy.currentOracleCommitment()))
      .to.emit(f.directory,'ExitSettled').withArgs(f.hash,100_000_000n,93_530_000n);
    const after=await f.directory.accounting(f.hash);
    expect(after.assetFees).to.equal(before.assetFees);expect(after.reserveFees).to.equal(before.reserveFees);
    expect(after.exitTrades).to.equal(1);
    expect(await f.vm.hash(f.order)).to.equal(f.hash);
    expect(await f.reserve.allowance(f.maker.address,executor.target)).to.equal(0);
    expect((await f.aqua.rawBalances(f.maker.address,f.vm.target,f.hash,f.asset.target))[1]).to.equal(2);
  });
});
