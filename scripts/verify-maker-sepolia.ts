// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// Explicit, bounded no-value Sepolia integration test. Founder-controlled actors;
// not independent adoption, market activity or a profitability benchmark.
import {ethers,network} from 'hardhat';
import assert from 'node:assert/strict';
import market from '../web/lib/breakwater-deployment.json';
import release from '../web/lib/maker-deployment.json';
import {TakerTraitsLib} from '../test/utils/SwapVMHelpers';

async function main(){
  assert.equal(process.env.BREAKWATER_TESTNET_WRITE,'yes','Explicit testnet-write flag required');
  assert.equal(network.name,'sepolia');assert.equal((await ethers.provider.getNetwork()).chainId,11155111n);
  const [owner]=await ethers.getSigners();
  assert.equal(owner.address.toLowerCase(),'0x704ab4b6729ac0603e8dfd459477f6c3cc963fd3');
  const dir:any=await ethers.getContractAt('BreakwaterPositions',release.positions);
  const existing=await dir.ownerPositionCount(owner.address);
  const resume=process.env.BREAKWATER_RESUME_HASH;
  assert(existing===0n || (existing===1n && resume===await dir.ownerPositionAt(owner.address,0)),
    'One-shot test: an interrupted run needs its exact existing order hash');
  const fees=await ethers.provider.getFeeData();
  assert(fees.maxFeePerGas && fees.maxFeePerGas<=3_000_000_000n,'Test gas-price budget exceeded');
  assert(await ethers.provider.getBalance(owner.address)>5_000_000n*fees.maxFeePerGas,'Keep enough project test ETH for the bounded test');
  const overrides={maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas};
  const receipts:Record<string,string>={};
  const sent=async(name:string,tx:Promise<any>)=>{const r=await(await tx).wait();assert.equal(r.status,1);receipts[name]=r.hash;console.log(name,r.hash);return r;};
  const asset:any=await ethers.getContractAt('DemoFaucetToken',market.badToken);
  const reserve:any=await ethers.getContractAt('DemoFaucetToken',market.goodToken);
  const aqua:any=await ethers.getContractAt('Aqua',market.aqua);
  const vm:any=await ethers.getContractAt('AquaSwapVMRouter',market.router);
  const settings={assetAllocation:100_000_000n,reserveAllocation:100_000_000n,feeBps:30,
    trigger:980_000_000_000_000_000n,discountBps:50,assetMaxAge:86400,reserveMaxAge:90000};
  if(!resume)await sent('create',dir.createDemo(settings,overrides));
  const hash=await dir.ownerPositionAt(owner.address,0),p=await dir.position(hash);
  const policy:any=await ethers.getContractAt('BreakwaterPolicy',p.policy);
  const scenario:any=await ethers.getContractAt('BreakwaterScenario',p.scenario);
  const order={maker:p.owner,traits:p.orderTraits,data:p.orderData};
  assert.equal(await vm.hash(order),hash);
  for(const [name,token] of [['asset',asset],['reserve',reserve]] as const){
    assert(await token.balanceOf(owner.address)>=120_000_000n,'Not enough sample-token backing');
    // Preserve existing allowances used by the original public position.
    if(await token.allowance(owner.address,market.aqua)<100_000_000n)
      await sent(`approve-${name}`,token.approve(market.aqua,100_000_000n,overrides));
  }
  if((await aqua.rawBalances(owner.address,market.router,hash,market.badToken))[1]===0n)
    await sent('ship',aqua.ship(market.router,ethers.AbiCoder.defaultAbiCoder().encode(
      ['tuple(address maker,uint256 traits,bytes data)'],[order]),[market.badToken,market.goodToken],[100_000_000n,100_000_000n],overrides));
  let taker:any;
  if(resume){
    const prior=await ethers.provider.getTransaction(process.env.BREAKWATER_RESUME_TAKER_TX!);
    assert(prior?.to&&prior.from.toLowerCase()===owner.address.toLowerCase(),'Known test transaction required');
    taker=await ethers.getContractAt('MockTaker',prior.to);
    assert.equal((await taker.owner()).toLowerCase(),owner.address.toLowerCase());
    assert.equal((await taker.swapVM()).toLowerCase(),market.router.toLowerCase());
  }else{
    taker=await ethers.deployContract('MockTaker',[market.aqua,market.router,owner.address],overrides);
    await taker.waitForDeployment();receipts.taker=taker.deploymentTransaction().hash;
    await sent('fund-test-taker-asset',asset.transfer(taker.target,20_000_000n,overrides));
    await sent('fund-test-taker-reserve',reserve.transfer(taker.target,20_000_000n,overrides));
  }
  const args=async(assetIn:boolean,amount=1_000_000n)=>[order,assetIn?market.badToken:market.goodToken,
    assetIn?market.goodToken:market.badToken,amount,TakerTraitsLib.build({isExactIn:true,
      hasPreTransferInCallback:true,instructionsArgs:await policy.currentOracleCommitment(),
      deadline:(await ethers.provider.getBlock('latest'))!.timestamp+600})] as const;
  if(!resume){
    await sent('healthy-asset-in',taker.swap(...await args(true),overrides));
    await sent('healthy-reserve-in',taker.swap(...await args(false),overrides));
  }
  let a=await dir.accounting(hash);assert.equal(a.assetFees,3000n);assert.equal(a.reserveFees,3000n);assert.equal(a.healthyTrades,2n);
  if(await scenario.scenario()!==1n)await sent('stress',scenario.setScenario(1,overrides));
  const expectPolicyError=async(call:Promise<any>,name:string)=>{
    await assert.rejects(call,(error:any)=>{
      const data=error.data??error.info?.error?.data;
      return typeof data==='string'&&policy.interface.parseError(data)?.name===name;
    },`Expected ${name}`);
  };
  await expectPolicyError(vm.quote.staticCall(...await args(true)),'ToxicDirectionBlocked');
  const assetBefore=(await aqua.rawBalances(owner.address,market.router,hash,market.badToken))[0];
  await sent('exit',taker.swap(...await args(false,5_000_000n),overrides));
  a=await dir.accounting(hash);assert.equal(a.reserveProceeds,5_000_000n);assert.equal(a.exitTrades,1n);
  assert.equal(a.assetFees,3000n);assert.equal(a.reserveFees,3000n);
  assert.equal((await aqua.rawBalances(owner.address,market.router,hash,market.badToken))[0],assetBefore-a.assetExited);
  for(const state of [2,3]){
    await sent(`halt-${state}`,scenario.setScenario(state,overrides));
    await expectPolicyError(vm.quote.staticCall(...await args(false)),'UnsafeReserve');
  }
  await sent('restore-healthy',scenario.setScenario(0,overrides));
  assert.equal((await policy.snapshot())[0],true);
  console.log('MAKER_SEPOLIA_RESULT='+JSON.stringify({chainId:11155111,owner:owner.address,positions:release.positions,
    orderHash:hash,policy:p.policy,scenario:p.scenario,taker:taker.target,receipts,
    assetFees:a.assetFees.toString(),reserveFees:a.reserveFees.toString(),assetExited:a.assetExited.toString(),
    reserveProceeds:a.reserveProceeds.toString(),positionLeftHealthy:true,cancellationTestedLocallyOnly:true,
    evidence:'Founder-operated Sepolia integration with a founder-controlled MockTaker, not independent use or live-market economics'}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
