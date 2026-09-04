// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm-template/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:copyright © 2026 Breakwater contributors
/// @custom:notice Modified from the official AquaAMM template on 2026-09-04.

import { AquaOpcodes } from "@1inch/swap-vm/src/opcodes/AquaOpcodes.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import { ProgramBuilder, Program } from "@1inch/swap-vm/test/utils/ProgramBuilder.sol";

import { ControlsArgsBuilder } from "@1inch/swap-vm/src/instructions/Controls.sol";
import { PeggedSwapArgsBuilder } from "@1inch/swap-vm/src/instructions/PeggedSwap.sol";

/// @title BreakwaterAMM
/// @notice Builds immutable Aqua/SwapVM positions whose guard either continues
///         into healthy pegged pricing or supplies and jumps past it during stress.
contract BreakwaterAMM is AquaOpcodes {
    using ProgramBuilder for Program;

    error BreakwaterZeroGuard();

    constructor(address aqua) AquaOpcodes(aqua) {}

    /// @notice Build a guard-first position with conditional two-way pegged pricing.
    /// @dev Initial balances and rates correspond to tokenA/tokenB as supplied;
    ///      they are reordered with the tokens before encoding the strategy.
    function buildProgram(
        address maker,
        address tokenA,
        address tokenB,
        address guard,
        uint256 initialBalanceA,
        uint256 initialBalanceB,
        uint256 rateA,
        uint256 rateB,
        uint256 linearWidth,
        uint64 salt,
        uint40 deadline
    ) external pure returns (ISwapVM.Order memory) {
        require(guard != address(0), BreakwaterZeroGuard());

        if (tokenA > tokenB) {
            (tokenA, tokenB) = (tokenB, tokenA);
            (initialBalanceA, initialBalanceB) = (initialBalanceB, initialBalanceA);
            (rateA, rateB) = (rateB, rateA);
        }

        PeggedSwapArgsBuilder.Args memory peggedArgs = PeggedSwapArgsBuilder.Args({
            x0: initialBalanceA * rateA,
            y0: initialBalanceB * rateB,
            linearWidth: linearWidth,
            rateLt: rateA,
            rateGt: rateB
        });

        Program memory program = ProgramBuilder.init(_opcodes());
        bytes memory peggedInstruction = program.build(
            _peggedSwapGrowPriceRange2D,
            PeggedSwapArgsBuilder.build(peggedArgs)
        );
        bytes memory guardInstruction = program.build(
            _extruction,
            abi.encodePacked(guard, uint16(peggedInstruction.length))
        );
        bytes memory bytecode = bytes.concat(
            (deadline > 0)
                ? program.build(_deadline, ControlsArgsBuilder.buildDeadline(deadline))
                : bytes(""),
            guardInstruction,
            peggedInstruction,
            (salt > 0) ? program.build(_salt, ControlsArgsBuilder.buildSalt(salt)) : bytes("")
        );

        return MakerTraitsLib.build(MakerTraitsLib.Args({
            maker: maker,
            receiver: address(0),
            tokenA: tokenA,
            tokenB: tokenB,
            shouldUnwrapWeth: false,
            useAquaInsteadOfSignature: true,
            allowZeroAmountIn: false,
            hasPreTransferInHook: false,
            hasPostTransferInHook: false,
            hasPreTransferOutHook: false,
            hasPostTransferOutHook: false,
            preTransferInTarget: address(0),
            preTransferInData: "",
            postTransferInTarget: address(0),
            postTransferInData: "",
            preTransferOutTarget: address(0),
            preTransferOutData: "",
            postTransferOutTarget: address(0),
            postTransferOutData: "",
            program: bytecode
        }));
    }
}
