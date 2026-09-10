// AI-assisted, local historical counterfactual. No live broadcasts or wallet keys.
// Four PREDECLARED checkpoints, not reconstructed continuous order flow.
import {expect} from 'chai';
import {ethers} from 'hardhat';
import {TakerTraitsLib} from './utils/SwapVMHelpers';

const A='0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const R='0xdac17f958d2ee523a2206206994597c13d831ec7';
const AF='0x8fffffd4afb6115b954bd326cbe7b4ba576818f6';
const RF='0x3e7d1eab13ad0104d2750b8863b489d65364e32d';
const EF='0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419';
const VENUE='0xe592427a0aece92de3edee1f18e0157c05861564';
const POOL='0x7858e59e0c01ea06df3af3d20ac7b0003275d4bf';
const WHALE='0xf977814e90da44bfa03b6295a0616a897441acec';
const RESERVE_WHALE='0x28c6c06298d514db089934071355e5743bf21d60';
const UNIT=10n**6n, INITIAL=100_000n*UNIT, SIZE=10_000n*UNIT;
const tokenAbi=['function balanceOf(address) view returns(uint256)','function transfer(address,uint256) returns(bool)','function approve(address,uint256) returns(bool)'];
const feedAbi=['function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)'];
const venueAbi=[
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256)',
  'function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96)) payable returns(uint256)',
];
const cases=[['pre-shock',16794061],['stress',16802331],['trough-window',16803515],['recovery',16818931]] as const;
const suite=process.env.GUARD_BENEFIT_RPC ? describe : describe.skip;

suite('Guard benefit: matched independent historical checkpoints',function(){
  this.timeout(300_000);
  for(const [phase,block] of cases) it(`${phase} at ${block}`,async()=>{
    console.log('GUARD_BENEFIT_START',phase,block);
    await ethers.provider.send('hardhat_reset',[{forking:{jsonRpcUrl:process.env.GUARD_BENEFIT_RPC,blockNumber:block}}]);
    await ethers.provider.send('evm_mine',[]);
    const header=await ethers.provider.getBlock(block);
    if(!header)throw new Error('Historical header unavailable');
    let tick=header.timestamp+2;
    const next=()=>ethers.provider.send('evm_setNextBlockTimestamp',[++tick]);
    const deploy=async(name:string,args:any[]=[]):Promise<any>=>{await next();const c=await ethers.deployContract(name,args);await c.waitForDeployment();return c;};
    const [owner,taker]=await ethers.getSigners();
    const asset:any=await ethers.getContractAt(tokenAbi,A),reserve:any=await ethers.getContractAt(tokenAbi,R);
    const venue:any=await ethers.getContractAt(venueAbi,VENUE);
    const feeds:any={};
    for(const [key,address] of [['asset',AF],['reserve',RF],['eth',EF]]){
      const f:any=await ethers.getContractAt(feedAbi,address),v=await f.latestRoundData();
      expect(v[1]).gt(0);expect(v[3]).lte(header.timestamp);expect(v[4]).gte(v[0]);
      feeds[key]={address,round:v[0],answer:v[1],updatedAt:v[3],age:BigInt(header.timestamp)-v[3]};
    }
    const pool:any=await ethers.getContractAt(['function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)','function token0() view returns(address)'],POOL);
    expect((await pool.token0()).toLowerCase()).equal(A);
    const sqrt=BigInt((await pool.slot0())[0]);
    const marketRatioE18=sqrt*sqrt*10n**18n/(1n<<192n);
    const ceil=(a:bigint,b:bigint)=>(a+b-1n)/b;
    const gasCost=(units:bigint)=>ceil(units*(header.baseFeePerGas!+2_000_000_000n)*feeds.eth.answer*UNIT,10n**18n*feeds.reserve.answer);
    const budget=(units:bigint)=>gasCost(ceil(units*120n,100n));
    const aqua=await deploy('Aqua'),weth=await deploy('WETHMock');
    const vm=await deploy('AquaSwapVMRouter',[aqua.target,weth.target,owner.address,'Guard benefit counterfactual','1.0.2']);
    const builder=await deploy('BreakwaterMakerAMM',[aqua.target]);
    const ledger=await deploy('BreakwaterPositions',[vm.target,builder.target,A,R]);
    const treasury=await deploy('BenchmarkTreasury',[owner.address,aqua.target,vm.target,VENUE,A,R,500]);
    await ethers.provider.send('hardhat_impersonateAccount',[WHALE]);
    await ethers.provider.send('hardhat_setBalance',[WHALE,'0x56BC75E2D63100000']);
    const whale=await ethers.getSigner(WHALE);
    expect(await asset.balanceOf(WHALE)).gte(INITIAL);
    await next();await(await asset.connect(whale).transfer(treasury.target,INITIAL)).wait();
    await ethers.provider.send('hardhat_stopImpersonatingAccount',[WHALE]);
    // Separate historical funder: the asset whale had zero USDT at recovery.
    // Transfer existing non-pool balances; never alter pool liquidity or token storage.
    expect(await reserve.balanceOf(RESERVE_WHALE)).gte(2n*INITIAL);
    await ethers.provider.send('hardhat_impersonateAccount',[RESERVE_WHALE]);
    await ethers.provider.send('hardhat_setBalance',[RESERVE_WHALE,'0x56BC75E2D63100000']);
    const reserveWhale=await ethers.getSigner(RESERVE_WHALE);
    for(const recipient of [treasury.target,taker.address]){
      await next();await(await reserve.connect(reserveWhale).transfer(recipient,INITIAL)).wait();
    }
    await ethers.provider.send('hardhat_stopImpersonatingAccount',[RESERVE_WHALE]);
    // Local-only setup impersonation registers the same maker account with the
    // production directory. It is NOT a shipped onboarding method for this harness.
    await ethers.provider.send('hardhat_impersonateAccount',[treasury.target]);
    await ethers.provider.send('hardhat_setBalance',[treasury.target,'0x56BC75E2D63100000']);
    await next();await(await ledger.connect(await ethers.getSigner(treasury.target)).create({
      assetAllocation:INITIAL,reserveAllocation:INITIAL,feeBps:30,trigger:980_000_000_000_000_000n,
      discountBps:50,assetMaxAge:86400,reserveMaxAge:90000},AF,RF)).wait();
    await ethers.provider.send('hardhat_stopImpersonatingAccount',[treasury.target]);
    const hash=await ledger.ownerPositionAt(treasury.target,0),position=await ledger.position(hash);
    const policy:any=await ethers.getContractAt('BreakwaterPolicy',position.policy);
    const order={maker:position.owner,traits:position.orderTraits,data:position.orderData};
    await next();const setup=await(await treasury.arm(order,ethers.ZeroHash,INITIAL,INITIAL,1000n*UNIT)).wait();
    for(const [t,to] of [[asset,vm.target],[asset,VENUE],[reserve,vm.target],[reserve,VENUE]]){
      await next();await(await t.connect(taker).approve(to,ethers.MaxUint256)).wait();
    }
    const unprotected=await deploy('BenchmarkUnprotectedPolicy',[vm.target,A,R,AF,RF]);
    const unprotectedCode=await ethers.provider.getCode(unprotected.target);
    const execTime=tick+1,deadline=execTime+600;
    const args=async(input:boolean,exactIn:boolean,quantity:bigint)=>[order,input?A:R,input?R:A,quantity,
      TakerTraitsLib.build({isExactIn:exactIn,useTransferFromAndAquaPush:true,deadline,
        instructionsArgs:await policy.currentOracleCommitment()})] as const;
    const state=async()=>({asset:await asset.balanceOf(treasury.target),reserve:await reserve.balanceOf(treasury.target),
      virtualAsset:(await aqua.rawBalances(treasury.target,vm.target,hash,A))[0],
      virtualReserve:(await aqua.rawBalances(treasury.target,vm.target,hash,R))[0],
      fees:(await ledger.accounting(hash)).assetFees});
    let snapshot=await ethers.provider.send('evm_snapshot',[]);
    const reset=async()=>{expect(await ethers.provider.send('evm_revert',[snapshot])).equal(true);snapshot=await ethers.provider.send('evm_snapshot',[]);tick=execTime-1;};
    const marketMarked=(a:bigint,r:bigint)=>a*marketRatioE18/10n**18n+r;
    const initialValue=marketMarked(INITIAL,INITIAL);
    const row:any={phase,block,blockHash:header.hash,headerTimestamp:header.timestamp,executionTimestamp:execTime,
      feeds,marketRatioE18,gasPriceWei:header.baseFeePerGas!+2_000_000_000n,setupArmGas:setup.gasUsed,
      initialAsset:INITIAL,initialReserve:INITIAL,tradeSize:SIZE};
    const buyParams={tokenIn:R,tokenOut:A,fee:500,recipient:taker.address,deadline,amountOut:SIZE,
      amountInMaximum:INITIAL,sqrtPriceLimitX96:0};
    row.externalAcquisitionCost=await venue.connect(taker).exactOutputSingle.staticCall(buyParams);
    const healthy=(await policy.snapshot())[0];row.policyHealthy=healthy;
    row.strictOneHourEligible=feeds.asset.age+BigInt(execTime-header.timestamp)<=3600n&&feeds.reserve.age+BigInt(execTime-header.timestamp)<=3600n;
    for(const variant of ['guarded','unguarded',...(!healthy?['delayedGuard']:[])]){
      await reset();
      if(variant==='unguarded')await ethers.provider.send('hardhat_setCode',[position.policy,unprotectedCode]);
      if(variant==='delayedGuard'){
        // CONTROLLED sensitivity, not an observed historical feed round: a 5-minute
        // old $1/$1 observation still inside the configured freshness window.
        const af=await deploy('MockPriceFeed',[8,100_000_000]);
        const rf=await deploy('MockPriceFeed',[8,100_000_000]);
        for(const f of [af,rf]){
          await next();await(await f.setRoundData(1,100_000_000,execTime-300,execTime-300,1)).wait();
        }
        const delayed=await deploy('BreakwaterPolicy',[vm.target,A,R,af.target,rf.target,86400,90000,980_000_000_000_000_000n,50]);
        await ethers.provider.send('hardhat_setCode',[position.policy,await ethers.provider.getCode(delayed.target)]);
        expect((await policy.snapshot())[0]).equal(true);
        row.delaySensitivity={kind:'synthetic accepted $1/$1 observations, not historical feed data',updatedAt:execTime-300,executionTimestamp:tick+1};
      }
      let quote:any;
      try{quote=await vm.quote.staticCall(...await args(true,true,SIZE));}
      catch(e){
        if(variant!=='guarded'||healthy)throw e;
        await expect(vm.quote.staticCall(...await args(true,true,SIZE))).revertedWithCustomError(policy,'ToxicDirectionBlocked');
        row[variant]={action:'impaired-inflow-refused',...await state(),markedReserveValue:initialValue};continue;
      }
      // Execute both real external acquisition and Aqua settlement on this local
      // fork, then retain as modeled available flow only when round-trip gas is covered.
      await next();const buy=await(await venue.connect(taker).exactOutputSingle(buyParams)).wait();
      await next();const fill=await(await vm.connect(taker).swap(...await args(true,true,SIZE))).wait();
      const gasUnits=buy.gasUsed+fill.gasUsed, cost=budget(gasUnits);
      const profit=BigInt(quote.amountOut)-BigInt(row.externalAcquisitionCost)-cost;
      const observed=await state();
      expect(observed.asset).equal(INITIAL+SIZE);expect(observed.reserve).equal(INITIAL-quote.amountOut);
      expect(observed.fees).equal(30n*UNIT);
      row[variant]={action:profit>0n?'rational-inflow-executed':'no-gas-covering-inflow',quoteOutput:quote.amountOut,
        sourceGas:buy.gasUsed,fillGas:fill.gasUsed,gasBudgetReserve:cost,takerProfitReserve:profit,
        trialState:observed};
      if(profit<=0n)await reset();
      Object.assign(row[variant],await state());
      row[variant].markedReserveValue=marketMarked(row[variant].asset,row[variant].reserve);
      row[variant].changeFromInitialMark=row[variant].markedReserveValue-initialValue;
    }
    await reset();
    // Competent zero-delay direct baseline: existing bounded treasury executor.
    // Same account/starting assets/price floor; no invented keeper wait. A failed
    // bounded exit is followed by immediate cancellation rather than continuing buys.
    row.direct={action:healthy?'not-triggered':'pending'};
    if(!healthy){
      const commitment=await policy.currentOracleCommitment();
      const trial=await treasury.directExit.staticCall(order,order,SIZE,0,deadline,commitment,false).catch(()=>undefined);
      if(trial===undefined){
        await next();const cancelled=await(await treasury.cancel()).wait();
        row.direct={action:'halted-exit-unavailable',executionGas:cancelled.gasUsed,gasBudgetReserve:budget(cancelled.gasUsed)};
      }else{
        await next();const tx=await(await treasury.directExit(order,order,SIZE,0,deadline,commitment,false)).wait();
        // A zero-delay owner who can pay cancellation gas can also pay exit gas
        // separately. Preserve this feasible route even if a self-funded keeper
        // cannot meet the same gross treasury floor after compensation.
        const ownerState=await state(),ownerGas=budget(tx.gasUsed);
        expect(ownerState.asset).equal(INITIAL-SIZE);
        expect(ownerState.reserve).equal(INITIAL+trial);
        expect(ownerState.virtualAsset).equal(0n);
        expect(ownerState.virtualReserve).equal(0n);
        row.ownerDirect={action:'owner-funded-bounded-exit',grossProceeds:trial,
          executionGas:tx.gasUsed,gasBudgetReserve:ownerGas,...ownerState,
          markedReserveValue:marketMarked(ownerState.asset,ownerState.reserve)-ownerGas};
        row.ownerDirect.changeFromInitialMark=row.ownerDirect.markedReserveValue-initialValue;
        const reward=budget(tx.gasUsed)+UNIT;await reset();
        const paidPossible=await treasury.directExit.staticCall(order,order,SIZE,reward,deadline,commitment,false).then(()=>true,()=>false);
        if(paidPossible){
          await next();const paid=await(await treasury.directExit(order,order,SIZE,reward,deadline,commitment,false)).wait();
          const measuredBudget=budget(paid.gasUsed);
          row.direct={action:'halted-and-exited',executionGas:paid.gasUsed,keeperReward:reward,gasBudgetReserve:measuredBudget,
            keeperNetReserve:reward-measuredBudget};
          expect(reward).gte(measuredBudget);
        }else{
          await reset();await next();const cancelled=await(await treasury.cancel()).wait();
          row.direct={action:'halted-exit-net-floor-unavailable',executionGas:cancelled.gasUsed,gasBudgetReserve:budget(cancelled.gasUsed)};
        }
      }
      Object.assign(row.direct,await state());
      // Failed quote screening incurs no onchain gas; cancellation gas is charged
      // to treasury wealth even though its owner pays native gas in this fixture.
      row.direct.markedReserveValue=marketMarked(row.direct.asset,row.direct.reserve)
        -(row.direct.keeperReward?0n:row.direct.gasBudgetReserve);
    }else Object.assign(row.direct,row.guarded,{action:'same-healthy-policy'});
    // Where no owner-funded bounded exit exists, retain the same immediate
    // cancellation fallback. Healthy rows remain independent initial states.
    row.ownerDirect??={...row.direct};
    await reset();
    // Optional standing-order exit: measure the existing callback without changing
    // its product role. Count only gas-covering external resale, never a subsidized taker.
    if(!healthy){
      const floor=(await vm.quote.staticCall(...await args(false,false,SIZE))).amountIn;
      const executor=await deploy('BreakwaterUnwindExecutor',[vm.target,aqua.target,VENUE,A,R,500,treasury.target,hash]);
      const commitment=await policy.currentOracleCommitment();
      const call=[order,SIZE,floor,1,deadline,commitment] as const;
      const possible=await executor.connect(taker).execute.staticCall(...call).catch(()=>undefined);
      if(!possible)row.guardedExit={action:'unavailable-before-gas',floor};
      else{
        await next();const receipt=await(await executor.connect(taker).execute(...call)).wait();
        const cost=budget(receipt.gasUsed),profit=possible[1]-cost;
        row.guardedExit={action:profit>0n?'gas-covering-exit':'unavailable-after-gas',floor,executionGas:receipt.gasUsed,gasBudgetReserve:cost,solverProfitReserve:profit};
        if(profit<=0n)await reset();
      }
      Object.assign(row.guardedExit,await state());
      row.guardedExit.markedReserveValue=marketMarked(row.guardedExit.asset,row.guardedExit.reserve);
    }
    console.log('GUARD_BENEFIT_RESULT',JSON.stringify(row,(_,v)=>typeof v==='bigint'?v.toString():v));
  });
});
