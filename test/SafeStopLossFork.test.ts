// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// AI-assisted counterfactual benchmark, no live funds; keeper prices are scenarios.
import {expect} from "chai";
import {ethers} from "hardhat";
import {TakerTraitsLib} from "./utils/SwapVMHelpers";

const BAD = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const RES = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const BAD_FEED = "0x8fffffd4afb6115b954bd326cbe7b4ba576818f6";
const RES_FEED = "0x3e7d1eab13ad0104d2750b8863b489d65364e32d";
const ETH_FEED = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";
const VENUE = "0xe592427a0aece92de3edee1f18e0157c05861564";
const POOL = "0x7858e59e0c01ea06df3af3d20ac7b0003275d4bf";
const WHALE = "0xf977814e90da44bfa03b6295a0616a897441acec";
const ERC20 = ["function balanceOf(address) view returns(uint256)", "function transfer(address,uint256) returns(bool)",
  "function approve(address,uint256) returns(bool)",
  "function allowance(address,address) view returns(uint256)"];
const FEED = ["function decimals() view returns(uint8)", "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"];
const suite = process.env.UNWIND_RPC_URL ? describe : describe.skip;
const blocks = process.env.COMPARISON_BLOCKS ? process.env.COMPARISON_BLOCKS.split(",").map(Number)
  : process.env.UNWIND_FORK_BLOCK ? [Number(process.env.UNWIND_FORK_BLOCK)] : [16802331,16803515,16804701];

suite("Safe batched stop-loss versus atomic clearing", function () {
  this.timeout(300_000);
  for (const block of blocks) it(`matched 10k exit at ${block}`, async function () {
    await ethers.provider.send("hardhat_reset", [{forking:{jsonRpcUrl:process.env.UNWIND_RPC_URL, blockNumber:block}}]);
    await ethers.provider.send("evm_mine", []);
    const header = await ethers.provider.send("eth_getBlockByNumber", [ethers.toQuantity(block),false]);
    // Deterministic fixture time: archive RPC latency must not age the oracle.
    let setupTimestamp=Number(BigInt(header.timestamp))+1;
    const setupTick=()=>ethers.provider.send("evm_setNextBlockTimestamp",[++setupTimestamp]);
    const [owner, keeper, outsider] = await ethers.getSigners();
    const deploy = async (name:string,args:any[]=[]):Promise<any> => {
      await setupTick();
      const c = await ethers.deployContract(name,args); await c.waitForDeployment(); return c;
    };
    const bad:any = await ethers.getContractAt(ERC20,BAD);
    const reserve:any = await ethers.getContractAt(ERC20,RES);
    const pool:any = await ethers.getContractAt(["function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)"],POOL);
    const feed = async(address:string) => {
      const c:any = await ethers.getContractAt(FEED,address); const r=await c.latestRoundData();
      expect(await c.decimals()).to.equal(8); expect(r[1]).to.be.gt(0);
      expect(r[3]).to.be.gt(0); expect(r[3]).to.be.lte(BigInt(header.timestamp));
      expect(BigInt(header.timestamp)-r[3]).to.be.lte(172800n); expect(r[4]).to.be.gte(r[0]);
      return {address,answer:r[1],round:r[0],updatedAt:r[3]};
    };
    const feeds = {bad:await feed(BAD_FEED),reserve:await feed(RES_FEED),eth:await feed(ETH_FEED)};
    const ceil=(a:bigint,b:bigint)=>(a+b-1n)/b;
    const gasCost=(g:bigint)=>ceil(g*(BigInt(header.baseFeePerGas)+2_000_000_000n)*feeds.eth.answer*1_000_000n,
      10n**18n*feeds.reserve.answer);
    const budget=(g:bigint)=>gasCost(ceil(g*120n,100n));
    const aqua=await deploy("Aqua"), weth=await deploy("WETHMock");
    const vm=await deploy("AquaSwapVMRouter",[aqua.target,weth.target,owner.address,"Matched benchmark","1.0.2"]);
    const strict = process.env.STRICT_USD_POLICY === "1";
    const guard=await deploy(strict ? "BreakwaterUsdGuard" : "BreakwaterGuard",
      [vm.target,BAD,RES,BAD_FEED,RES_FEED,strict ? 3600 : 172800,980_000_000_000_000_000n,50]);
    const amm=await deploy("BreakwaterAMM",[aqua.target]);
    const treasury=await deploy("BenchmarkTreasury",[owner.address,aqua.target,vm.target,VENUE,BAD,RES,500]);
    const inventory=100_000n*1_000_000n, quantity=10_000n*1_000_000n;
    await ethers.provider.send("hardhat_impersonateAccount",[WHALE]);
    await ethers.provider.send("hardhat_setBalance",[WHALE,"0x56BC75E2D63100000"]);
    await setupTick();
    await (await bad.connect(await ethers.getSigner(WHALE)).transfer(treasury.target,inventory)).wait();
    await ethers.provider.send("hardhat_stopImpersonatingAccount",[WHALE]);
    const build=async(salt:number)=>{
      const r=await amm.buildProgram(treasury.target,BAD,RES,guard.target,inventory,inventory,
        10n**12n,10n**12n,100n*10n**27n,salt,0);
      return {maker:r.maker,traits:r.traits,data:r.data};
    };
    const order=await build(1), next=await build(2);
    const hash=await vm.hash(order), nextHash=await vm.hash(next);
    await setupTick();
    await expect(treasury.connect(outsider).arm(order,nextHash,inventory,0,100_000_000)).to.be.revertedWithCustomError(treasury,"Unauthorized");
    await setupTick();
    const setup=await (await treasury.arm(order,nextHash,inventory,0,100_000_000)).wait();
    const executor=await deploy("BreakwaterUnwindExecutor",[vm.target,aqua.target,VENUE,BAD,RES,500,treasury.target,hash]);
    const timestamp=(await ethers.provider.getBlock("latest"))!.timestamp+1, deadline=timestamp+3600;
    let commitment:string;
    try { commitment=await guard.currentOracleCommitment(); }
    catch(error) {
      expect(strict).to.equal(true);
      await expect(guard.currentOracleCommitment()).to.be.revertedWithCustomError(guard,"StaleFeed");
      await expect(treasury.connect(keeper).directExit.staticCall(order,next,quantity,0,deadline,ethers.ZeroHash,true))
        .to.be.revertedWithCustomError(guard,"StaleFeed");
      await expect(executor.connect(keeper).execute.staticCall(order,quantity,quantity,1,deadline,ethers.ZeroHash))
        .to.be.revertedWithCustomError(guard,"StaleFeed");
      console.log("SAFE_DIRECT_EVIDENCE",JSON.stringify({block,blockHash:header.hash,strict,policyMaxAge:3600,
        result:"both rejected by strict observation freshness",reserveAgeAtExecution:timestamp-Number(feeds.reserve.updatedAt),
        badAgeAtExecution:timestamp-Number(feeds.bad.updatedAt)}));
      return;
    }
    const traits=TakerTraitsLib.build({taker:executor.target,isExactIn:false,deadline,instructionsArgs:commitment});
    const quoted=await vm.quote.staticCall(order,RES,BAD,quantity,traits);
    const floor=quoted.amountIn;
    const state=async()=>({bad:await bad.balanceOf(treasury.target),reserve:await reserve.balanceOf(treasury.target),
      keeper:await reserve.balanceOf(keeper.address),active:await treasury.activeHash(),next:await treasury.replacementHash(),
      oldBad:[...await aqua.rawBalances(treasury.target,vm.target,hash,BAD)],
      oldReserve:[...await aqua.rawBalances(treasury.target,vm.target,hash,RES)],
      newBad:[...await aqua.rawBalances(treasury.target,vm.target,nextHash,BAD)],
      newReserve:[...await aqua.rawBalances(treasury.target,vm.target,nextHash,RES)],
      routeApproval:await bad.allowance(treasury.target,VENUE),pool:[...await pool.slot0()]});
    const initial=await state(); expect(initial.keeper).to.equal(0); expect(initial.reserve).to.equal(0);
    let snap=await ethers.provider.send("evm_snapshot",[]);
    const reset=async()=>{expect(await ethers.provider.send("evm_revert",[snap])).to.equal(true); snap=await ethers.provider.send("evm_snapshot",[]);};
    const setTime=()=>ethers.provider.send("evm_setNextBlockTimestamp",[timestamp]);
    const results:any[]=[];
    let proceeds:bigint;
    try { proceeds=await treasury.connect(keeper).directExit.staticCall(order,next,quantity,0,deadline,commitment,true); }
    catch(error) {
      await expect(treasury.connect(keeper).directExit(order,next,quantity,0,deadline,commitment,true,{gasLimit:1_000_000}))
        .to.be.revertedWith("Too little received");
      expect(await state()).to.deep.equal(initial);
      await expect(executor.connect(keeper).execute.staticCall(order,quantity,floor,1,deadline,commitment)).to.be.revertedWith("Too little received");
      console.log("SAFE_DIRECT_EVIDENCE",JSON.stringify({block,blockHash:header.hash,strict,result:"both unavailable at equivalent treasury floor even with zero direct keeper reward",floor:floor.toString()}));
      return;
    }
    const gross=proceeds-floor;
    await setTime();
    const atomicReceipt=await (await executor.connect(keeper).execute(order,quantity,floor,1,deadline,commitment)).wait();
    const atomic=await state(); expect(atomic.bad).to.equal(inventory-quantity); expect(atomic.reserve).to.equal(floor);
    expect(atomic.oldBad[0]).to.equal(inventory-quantity); expect(atomic.oldBad[1]).to.equal(2);
    expect(atomic.oldReserve[0]).to.equal(floor); expect(atomic.keeper).to.equal(gross);
    const atomicGas:bigint=atomicReceipt.gasUsed, equalNet=gross-budget(atomicGas);
    results.push({route:"atomic",gas:atomicGas,gasBudgetUSDT:budget(atomicGas),reward:gross,treasury:floor,net:equalNet,originalPositionActive:true});

    const direct=async(reward:bigint,replace:boolean,label:string)=>{
      await reset(); await setTime();
      const receipt=await (await treasury.connect(keeper).directExit(order,next,quantity,reward,deadline,commitment,replace)).wait();
      const after=await state(); expect(after.bad).to.equal(inventory-quantity); expect(after.reserve).to.equal(proceeds-reward);
      expect(after.keeper).to.equal(reward); expect(after.oldBad).to.deep.equal([0n,255n]);
      expect(after.oldReserve).to.deep.equal([0n,255n]); expect(after.routeApproval).to.equal(0);
      expect(after.pool).to.deep.equal(atomic.pool);
      if(replace){
        expect(after.active).to.equal(nextHash); expect(after.newBad).to.deep.equal([inventory-quantity,2n]);
        expect(after.newReserve).to.deep.equal([proceeds-reward,2n]);
        expect((await vm.quote.staticCall(next,RES,BAD,1_000_000n,traits)).amountIn).to.be.gt(0);
        // Prove continued trading, not just a positive quote for the replacement.
        await ethers.provider.send("evm_setNextBlockTimestamp",[timestamp+1]);
        await (await reserve.connect(keeper).approve(vm.target,1_000_000n)).wait();
        const fillTraits=TakerTraitsLib.build({taker:keeper.address,isExactIn:true,useTransferFromAndAquaPush:true,
          deadline,instructionsArgs:commitment});
        await ethers.provider.send("evm_setNextBlockTimestamp",[timestamp+2]);
        await (await vm.connect(keeper).swap(next,RES,BAD,1_000_000n,fillTraits)).wait();
        const live=await aqua.safeBalances(treasury.target,vm.target,nextHash,BAD,RES);
        expect(live[0]).to.be.lt(inventory-quantity); expect(live[1]).to.equal(proceeds-reward+1_000_000n);
      }else expect(after.active).to.equal(ethers.ZeroHash);
      await expect(vm.quote.staticCall(order,RES,BAD,quantity,traits)).to.be.reverted;
      const gas:bigint=receipt.gasUsed;
      return {route:label,gas,gasBudgetUSDT:budget(gas),reward,treasury:proceeds-reward,net:reward-budget(gas),replacementActive:replace};
    };
    const closed=await direct(gross,false,"dock-sale-equal-gross-reward"); results.push(closed);
    const reopened=await direct(gross,true,"dock-sale-reship-equal-gross-reward"); results.push(reopened);
    if(equalNet>0n){
      // Same positive after-headroom keeper net, not an observed market fee.
      // Round payment UP using the measured direct budget; retain gas variance.
      for(const [replace,base] of [[false,closed],[true,reopened]] as const){
        let reward=base.gasBudgetUSDT+equalNet+10_000n; // 0.01 USDT calldata/gas rounding buffer.
        const matched=await direct(reward,replace,replace?"dock-sale-reship-matched-net":"dock-sale-matched-net");
        expect(matched.net).to.be.gte(equalNet);
        results.push(matched);
      }
    }
    // Authorization, boundaries and failed complete sale roll back cancellation.
    await reset();
    await expect(treasury.connect(outsider).cancel()).to.be.revertedWithCustomError(treasury,"Unauthorized");
    await expect(treasury.connect(outsider).withdraw(BAD,outsider.address,1)).to.be.revertedWithCustomError(treasury,"Unauthorized");
    await expect(treasury.withdraw(BAD,owner.address,1)).to.be.revertedWithCustomError(treasury,"InvalidRequest");
    await expect(treasury.connect(keeper).directExit(next,order,quantity,0,deadline,commitment,true)).to.be.reverted;
    await expect(treasury.connect(keeper).directExit(order,order,quantity,0,deadline,commitment,true)).to.be.reverted;
    await expect(treasury.connect(keeper).directExit(order,next,inventory+1n,0,deadline,commitment,true)).to.be.reverted;
    await expect(treasury.connect(keeper).directExit(order,next,quantity,100_000_001n,deadline,commitment,true)).to.be.reverted;
    await expect(treasury.connect(keeper).directExit(order,next,quantity,0,timestamp-2,commitment,true)).to.be.reverted;
    await expect(treasury.connect(keeper).directExit(order,next,quantity,0,deadline,ethers.ZeroHash,true)).to.be.reverted;
    await expect(treasury.connect(keeper).directExit(order,next,quantity,gross+1n,deadline,commitment,true,{gasLimit:1_000_000})).to.be.reverted;
    expect(await state()).to.deep.equal(initial);
    await (await treasury.cancel()).wait();
    await expect(treasury.connect(keeper).directExit(order,next,quantity,0,deadline,commitment,true)).to.be.reverted;
    const ownerBefore=await bad.balanceOf(owner.address);
    await (await treasury.withdraw(BAD,owner.address,inventory)).wait();
    expect(await bad.balanceOf(owner.address)).to.equal(ownerBefore+inventory);
    expect(await bad.balanceOf(treasury.target)).to.equal(0);
    console.log("SAFE_DIRECT_EVIDENCE",JSON.stringify({block,blockHash:header.hash,strict,timestamp,feeds,quantity,initialInventory:inventory,
      floor,externalProceeds:proceeds,setupGas:setup.gasUsed,results,
      assumptions:["same smart-account maker and funded state for both paths", "same oracle/program floor and route",
        strict ? "USD reserve band0.98–1.02; bad premium cap1.02; absolute bad trigger0.98; maximum observation age3600s"
          : "legacy relative-only guard, two-day maximum observation age",
        "historical base fee plus2gwei, 20percent gas headroom",
        "keeper compensation scenarios, not observed market prices", "owner preauthorizes replacement hash; no hidden owner action during exit",
        "setup excluded from marginal results and reported separately", "no healthy fees yet; no deployment or live transaction"]},
      (_,v)=>typeof v==="bigint"?v.toString():v));
  });
});
