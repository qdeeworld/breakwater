// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import {AquaOpcodes} from "@1inch/swap-vm/src/opcodes/AquaOpcodes.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib} from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import {ProgramBuilder, Program} from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";
import {ControlsArgsBuilder} from "@1inch/swap-vm/src/instructions/Controls.sol";
import {PeggedSwapArgsBuilder} from "@1inch/swap-vm/src/instructions/PeggedSwap.sol";
import {FeeArgsBuilder} from "@1inch/swap-vm/src/instructions/Fee.sol";

/// @notice Official Aqua opcodes: guard -> healthy maker fee -> pegged curve.
contract BreakwaterMakerAMM is AquaOpcodes {
    using ProgramBuilder for Program;
    struct Config {
        address maker;
        address asset;
        address reserve;
        address policy;
        address ledger;
        uint256 assetAllocation;
        uint256 reserveAllocation;
        uint256 assetRate;
        uint256 reserveRate;
        uint16 feeBps; // conventional basis points (10,000 = 100%)
        uint64 salt;
    }
    error InvalidPosition();
    constructor(address aqua) AquaOpcodes(aqua) {}

    function build(Config memory c) external pure returns (ISwapVM.Order memory) {
        if (c.maker == address(0) || c.policy == address(0) || c.ledger == address(0)
            || c.asset == c.reserve || c.assetAllocation == 0 || c.reserveAllocation == 0
            || c.feeBps > 100 || c.assetRate == 0 || c.reserveRate == 0) revert InvalidPosition();
        if (c.asset > c.reserve) {
            (c.assetAllocation,c.reserveAllocation) = (c.reserveAllocation,c.assetAllocation);
            (c.assetRate,c.reserveRate) = (c.reserveRate,c.assetRate);
        }
        Program memory p = ProgramBuilder.init(_opcodes());
        bytes memory healthy = bytes.concat(
            p.build(_flatFeeAmountInXD, FeeArgsBuilder.buildFlatFee(uint32(c.feeBps) * 100_000)),
            p.build(_peggedSwapGrowPriceRange2D, PeggedSwapArgsBuilder.build(PeggedSwapArgsBuilder.Args({
                x0: c.assetAllocation * c.assetRate, y0: c.reserveAllocation * c.reserveRate,
                linearWidth: 100e27, rateLt: c.assetRate, rateGt: c.reserveRate
            })))
        );
        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker:c.maker, receiver:address(0), shouldUnwrapWeth:false,
            useAquaInsteadOfSignature:true, allowZeroAmountIn:false,
            hasPreTransferInHook:true, hasPostTransferInHook:false,
            hasPreTransferOutHook:true, hasPostTransferOutHook:false,
            preTransferInTarget:c.ledger, preTransferInData:"",
            postTransferInTarget:address(0), postTransferInData:"",
            preTransferOutTarget:c.ledger, preTransferOutData:"",
            postTransferOutTarget:address(0), postTransferOutData:"",
            program:bytes.concat(
                p.build(_extruction, abi.encodePacked(c.policy,uint16(healthy.length))), healthy,
                p.build(_salt, ControlsArgsBuilder.buildSalt(c.salt)))
        }));
    }
}
