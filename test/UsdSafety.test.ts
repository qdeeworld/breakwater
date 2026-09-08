// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// AI-assisted controlled fixtures, not real-price or user evidence.
import {expect} from "chai";
import {ethers} from "hardhat";
import {loadFixture,time} from "@nomicfoundation/hardhat-network-helpers";
import {TakerTraitsLib} from "./utils/SwapVMHelpers";

async function fixture(){
  const [owner,maker,taker]=await ethers.getSigners();
  const deploy=async(n:string,a:any[]=[]):Promise<any>=>{const c=await ethers.deployContract(n,a);await c.waitForDeployment();return c;};
  const aqua=await deploy("Aqua"),weth=await deploy("WETHMock");
  const vm=await deploy("AquaSwapVMRouter",[aqua.target,weth.target,owner.address,"USD safety fixture","1.0.2"]);
  const bad=await deploy("MockToken",["Bad","BAD",6]),res=await deploy("MockToken",["Reserve","RES",6]);
  const bf=await deploy("MockPriceFeed",[8,100_000_000]),rf=await deploy("MockPriceFeed",[8,100_000_000]);
  const guard=await deploy("BreakwaterUsdGuard",[vm.target,bad.target,res.target,bf.target,rf.target,3600,980_000_000_000_000_000n,50]);
  const amm=await deploy("BreakwaterAMM",[aqua.target]);
  const built=await amm.buildProgram(maker.address,bad.target,res.target,guard.target,1_000_000_000n,1_000_000_000n,
    10n**12n,10n**12n,100n*10n**27n,1,0);
  const order={maker:built.maker,traits:built.traits,data:built.data}; const hash=await vm.hash(order);
  for(const t of [bad,res]){
    await t.mint(maker.address,1_000_000_000n);await t.connect(maker).approve(aqua.target,ethers.MaxUint256);
    await t.mint(taker.address,100_000_000n);await t.connect(taker).approve(vm.target,ethers.MaxUint256);
  }
  await aqua.connect(maker).ship(vm.target,ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address maker,uint256 traits,bytes data)"],[order]),[bad.target,res.target],[1_000_000_000n,1_000_000_000n]);
  const args=async(badIn=false)=>[order,badIn?bad.target:res.target,badIn?res.target:bad.target,1_000_000n,
    TakerTraitsLib.build({taker:taker.address,isExactIn:true,useTransferFromAndAquaPush:true,
      instructionsArgs:await guard.currentOracleCommitment()})] as const;
  return {owner,maker,taker,deploy,aqua,vm,bad,res,bf,rf,guard,order,hash,args};
}

describe("Independent USD safety boundaries",function(){
  for(const [label,b,r,error] of [
    ["reserve-only depeg",100_000_000,94_000_000,"UnsafeReserve"],
    ["both depeg at same relative price",94_000_000,94_000_000,"UnsafeReserve"],
    ["reserve excessive premium",100_000_000,102_000_001,"UnsafeReserve"],
    ["impaired-token excessive premium",102_000_001,100_000_000,"UnsupportedAssetPremium"],
    ["reserve just below lower bound",100_000_000,97_999_999,"UnsafeReserve"]
  ] as const) it(`halts both directions: ${label}`,async()=>{
    const f=await loadFixture(fixture);await f.bf.setAnswer(b);await f.rf.setAnswer(r);
    for(const direction of [false,true]){
      const args=await f.args(direction);
      await expect(f.vm.quote.staticCall(...args)).to.be.revertedWithCustomError(f.guard,error);
      await expect(f.vm.connect(f.taker).swap(...args)).to.be.revertedWithCustomError(f.guard,error);
    }
  });
  it("same order survives healthy, stress, reserve halt and recovery without reship",async()=>{
    const f=await loadFixture(fixture);
    await f.vm.connect(f.taker).swap(...await f.args(true));
    await f.bf.setAnswer(94_000_000);
    await expect(f.vm.quote.staticCall(...await f.args(true))).to.be.revertedWithCustomError(f.guard,"ToxicDirectionBlocked");
    await f.vm.connect(f.taker).swap(...await f.args(false));
    await f.rf.setAnswer(94_000_000);
    await expect(f.vm.quote.staticCall(...await f.args(false))).to.be.revertedWithCustomError(f.guard,"UnsafeReserve");
    await f.bf.setAnswer(100_000_000);await f.rf.setAnswer(100_000_000);
    await f.vm.connect(f.taker).swap(...await f.args(true));
    expect(await f.vm.hash(f.order)).to.equal(f.hash);
    expect((await f.aqua.rawBalances(f.maker.address,f.vm.target,f.hash,f.bad.target))[1]).to.equal(2);
  });
  it("absolute bad depeg cannot hide behind a still-safe lower reserve price",async()=>{
    const f=await loadFixture(fixture);await f.bf.setAnswer(97_000_000);await f.rf.setAnswer(98_000_000);
    await expect(f.vm.quote.staticCall(...await f.args(true))).to.be.revertedWithCustomError(f.guard,"ToxicDirectionBlocked");
    expect((await f.vm.quote.staticCall(...await f.args(false))).amountOut).to.be.gt(0);
  });
  it("includes exact safe USD boundaries",async()=>{
    const f=await loadFixture(fixture);await f.bf.setAnswer(98_000_000);await f.rf.setAnswer(98_000_000);
    expect((await f.vm.quote.staticCall(...await f.args(true))).amountOut).to.be.gt(0);
    await f.bf.setAnswer(102_000_000);await f.rf.setAnswer(102_000_000);
    expect((await f.vm.quote.staticCall(...await f.args(false))).amountOut).to.be.gt(0);
  });
  it("rejects observations past one hour without relaxing for a profitable quote",async()=>{
    const f=await loadFixture(fixture);await time.increase(3601);
    await expect(f.guard.currentOracleCommitment()).to.be.revertedWithCustomError(f.guard,"StaleFeed");
  });
  it("rejects a configured age above the conservative experimental cap",async()=>{
    const f=await loadFixture(fixture);
    await expect(f.deploy("BreakwaterUsdGuard",[f.vm.target,f.bad.target,f.res.target,f.bf.target,f.rf.target,3601,
      980_000_000_000_000_000n,50])).to.be.revertedWithCustomError(f.guard,"ExcessiveObservationAge");
  });
});
