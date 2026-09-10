// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:copyright © 2026 Breakwater contributors
/// @notice TEST ONLY. Invented proceeds and minted liquidity test settlement mechanics,
///         never market feasibility, treasury advantage, or historical depeg economics.
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IUnwindV3Router } from "./BreakwaterUnwindExecutor.sol";

contract MockUnwindVenue is IUnwindV3Router {
    using SafeERC20 for IERC20;

    address public immutable IMPAIRED;
    address public immutable RESERVE;
    uint24 public immutable FEE;
    uint256 public proceeds;
    uint256 public reportedProceeds = type(uint256).max;
    uint16 public consumptionBps = 10_000;
    bool public enforceMinimum = true;
    bool public fail;
    uint256 public calls;
    address public reentryTarget;
    bytes public reentryData;
    bool public reentrySucceeded;
    bytes public reentryResult;

    error InvalidRoute();
    error TooLittleReceived();
    error DeliberateFailure();

    constructor(address impaired, address reserve, uint24 fee, uint256 output) {
        IMPAIRED = impaired;
        RESERVE = reserve;
        FEE = fee;
        proceeds = output;
    }

    function setProceeds(uint256 output) external { proceeds = output; }
    function setReportedProceeds(uint256 output) external { reportedProceeds = output; }
    function setConsumptionBps(uint16 bps) external { consumptionBps = bps; }
    function setEnforceMinimum(bool enforce) external { enforceMinimum = enforce; }
    function setFailure(bool enabled) external { fail = enabled; }
    function setReentry(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryData = data;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external payable override returns (uint256)
    {
        if (params.tokenIn != IMPAIRED || params.tokenOut != RESERVE || params.fee != FEE ||
            params.recipient != msg.sender || params.deadline < block.timestamp ||
            params.sqrtPriceLimitX96 != 0 || msg.value != 0) revert InvalidRoute();
        ++calls;
        if (fail) revert DeliberateFailure();
        if (reentryTarget != address(0)) {
            (reentrySucceeded, reentryResult) = reentryTarget.call(reentryData);
        }
        IERC20(IMPAIRED).safeTransferFrom(msg.sender, address(this),
                                         params.amountIn * consumptionBps / 10_000);
        IERC20(RESERVE).safeTransfer(params.recipient, proceeds);
        if (enforceMinimum && proceeds < params.amountOutMinimum) revert TooLittleReceived();
        return reportedProceeds == type(uint256).max ? proceeds : reportedProceeds;
    }
}
