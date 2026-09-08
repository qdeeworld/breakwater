// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// Deploy only the owner directory/builder; preserve the existing public market.
import {ethers,deployments,network} from 'hardhat';
import manifest from '../web/lib/breakwater-deployment.json';

async function main(){
  const chain=(await ethers.provider.getNetwork()).chainId;
  if(network.name!=='sepolia'||chain!==11155111n)throw new Error('This release script supports Sepolia only.');
  const [signer]=await ethers.getSigners();
  if(signer.address.toLowerCase()!=='0x704ab4b6729ac0603e8dfd459477f6c3cc963fd3')throw new Error('Unexpected project deployment wallet.');
  for(const address of [manifest.aqua,manifest.router,manifest.badToken,manifest.goodToken]){
    if(await ethers.provider.getCode(address)==='0x')throw new Error(`No code at configured address ${address}`);
  }
  const vm=await ethers.getContractAt('AquaSwapVMRouter',manifest.router);
  if((await vm.AQUA()).toLowerCase()!==manifest.aqua.toLowerCase())throw new Error('Router/Aqua mismatch.');
  const fees=await ethers.provider.getFeeData();
  const balance=await ethers.provider.getBalance(signer.address);
  // Bounded testnet exposure; no mainnet chain or alternate wallet fallback.
  if(!fees.maxFeePerGas||fees.maxFeePerGas>10_000_000_000n)throw new Error('Gas cap exceeded; wait rather than raise the budget.');
  if(balance<fees.maxFeePerGas*7_000_000n)throw new Error('Insufficient project test ETH for the conservative deployment gas budget.');
  console.log('Project deployer',signer.address,'Sepolia balance',ethers.formatEther(balance));
  const options={from:signer.address,log:true,waitConfirmations:1,maxFeePerGas:fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas:(fees.maxPriorityFeePerGas??1_000_000_000n).toString()};
  const builder=await deployments.deploy('BreakwaterMakerBuilder',{...options,contract:'BreakwaterMakerAMM',args:[manifest.aqua]});
  const positions=await deployments.deploy('BreakwaterOwnerPositions',{...options,contract:'BreakwaterPositions',
    args:[manifest.router,builder.address,manifest.badToken,manifest.goodToken]});
  console.log('MAKER_MANIFEST='+JSON.stringify({chainId:Number(chain),positions:positions.address,builder:builder.address,
    deployedAtBlock:String(positions.receipt?.blockNumber??await ethers.provider.getBlockNumber())}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
