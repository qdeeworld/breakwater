// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:copyright © 2026 Breakwater contributors
/// @notice EXPERIMENTAL: one position, one standard ERC20 pair, one vetted V3 route.
///         No deployment or security-audit claim. Surplus excludes native gas cost.
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";
import { ISwapVM } from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import { ITakerCallbacks } from "@1inch/swap-vm/src/interfaces/ITakerCallbacks.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/src/libs/TakerTraits.sol";

interface IUnwindV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256);
}

interface IUnwindSwapVMConfiguration {
    function AQUA() external view returns (address);
}

contract BreakwaterUnwindExecutor is ITakerCallbacks {
    using SafeERC20 for IERC20;

    ISwapVM public immutable SWAP_VM;
    IAqua public immutable AQUA;
    IUnwindV3Router public immutable VENUE;
    IERC20 public immutable IMPAIRED;
    IERC20 public immutable RESERVE;
    uint24 public immutable POOL_FEE;
    address public immutable MAKER;
    bytes32 public immutable ORDER_HASH;

    struct Execution {
        uint8 phase; // 0 idle, 1 awaiting callback, 2 selling, 3 repaid
        uint40 deadline;
        uint256 amountOut;
        uint256 maxPayment;
        uint256 minSurplus;
        uint256 badBefore;
        uint256 reserveBefore;
        uint256 payment;
    }
    Execution private _execution;

    error InvalidConfiguration();
    error InvalidRequest();
    error ExecutionActive();
    error InvalidCallback();
    error InvalidBalanceDelta();
    error InsufficientProceeds();
    event Unwound(bytes32 indexed orderHash, address indexed solver, uint256 impairedSold,
                  uint256 makerProceeds, uint256 solverSurplus);

    constructor(address swapVM, address aqua, address venue, address impaired, address reserve,
                uint24 poolFee, address maker, bytes32 orderHash) {
        if (swapVM.code.length == 0 || aqua.code.length == 0 || venue.code.length == 0 ||
            impaired.code.length == 0 || reserve.code.length == 0 || impaired == reserve ||
            maker == address(0) || orderHash == bytes32(0) ||
            IUnwindSwapVMConfiguration(swapVM).AQUA() != aqua) revert InvalidConfiguration();
        SWAP_VM = ISwapVM(swapVM);
        AQUA = IAqua(aqua);
        VENUE = IUnwindV3Router(venue);
        IMPAIRED = IERC20(impaired);
        RESERVE = IERC20(reserve);
        POOL_FEE = poolFee;
        MAKER = maker;
        ORDER_HASH = orderHash;
    }

    /// @notice Anyone can clear this one shipped position and receive the surplus.
    /// @dev Full execute eth_call is needed; a SwapVM quote never simulates the venue.
    function execute(ISwapVM.Order calldata order, uint256 impairedAmount,
                     uint256 maxPayment, uint256 minSurplus, uint40 deadline,
                     bytes32 oracleCommitment) external returns (uint256 payment, uint256 surplus) {
        if (_execution.phase != 0) revert ExecutionActive();
        if (order.maker != MAKER || SWAP_VM.hash(order) != ORDER_HASH || impairedAmount == 0 ||
            maxPayment == 0 || minSurplus == 0 || deadline < block.timestamp) revert InvalidRequest();
        _execution = Execution(1, deadline, impairedAmount, maxPayment, minSurplus,
                               IMPAIRED.balanceOf(address(this)), RESERVE.balanceOf(address(this)), 0);

        TakerTraitsLib.Args memory args;
        args.taker = address(this);
        args.isExactIn = false;
        args.isFirstTransferFromTaker = false;
        args.hasPreTransferInCallback = true;
        args.threshold = abi.encode(maxPayment);
        args.deadline = deadline;
        args.instructionsArgs = abi.encode(oracleCommitment);
        uint256 received;
        bytes32 settledHash;
        (payment, received, settledHash) = SWAP_VM.swap(order, address(RESERVE), address(IMPAIRED),
                                   impairedAmount, TakerTraitsLib.build(args));
        Execution memory completed = _execution;
        if (completed.phase != 3 || payment != completed.payment || received != impairedAmount ||
            settledHash != ORDER_HASH ||
            IMPAIRED.balanceOf(address(this)) != completed.badBefore) revert InvalidBalanceDelta();
        uint256 reserveAfter = RESERVE.balanceOf(address(this));
        if (reserveAfter < completed.reserveBefore + minSurplus) revert InsufficientProceeds();
        surplus = reserveAfter - completed.reserveBefore;
        RESERVE.safeTransfer(msg.sender, surplus);
        if (RESERVE.balanceOf(address(this)) != completed.reserveBefore) revert InvalidBalanceDelta();
        delete _execution; // Keep the global lock through payout.
        emit Unwound(ORDER_HASH, msg.sender, impairedAmount, payment, surplus);
    }

    function preTransferInCallback(address maker, address taker, address tokenIn, address tokenOut,
                                   uint256 amountIn, uint256 amountOut, bytes32 orderHash,
                                   bytes calldata data) external override {
        Execution memory running = _execution;
        if (msg.sender != address(SWAP_VM) || running.phase != 1 || maker != MAKER ||
            taker != address(this) || tokenIn != address(RESERVE) || tokenOut != address(IMPAIRED) ||
            orderHash != ORDER_HASH || amountOut != running.amountOut || amountIn == 0 ||
            amountIn > running.maxPayment || data.length != 0) revert InvalidCallback();
        if (IMPAIRED.balanceOf(address(this)) != running.badBefore + amountOut ||
            RESERVE.balanceOf(address(this)) != running.reserveBefore) revert InvalidBalanceDelta();
        _execution.phase = 2;
        IMPAIRED.forceApprove(address(VENUE), amountOut);
        uint256 reported = VENUE.exactInputSingle(IUnwindV3Router.ExactInputSingleParams({
            tokenIn: address(IMPAIRED), tokenOut: address(RESERVE), fee: POOL_FEE,
            recipient: address(this), deadline: running.deadline, amountIn: amountOut,
            amountOutMinimum: amountIn + running.minSurplus, sqrtPriceLimitX96: 0
        }));
        IMPAIRED.forceApprove(address(VENUE), 0);
        uint256 reserveAfterSale = RESERVE.balanceOf(address(this));
        if (reserveAfterSale < running.reserveBefore + amountIn + running.minSurplus)
            revert InsufficientProceeds();
        if (reported != reserveAfterSale - running.reserveBefore ||
            IMPAIRED.balanceOf(address(this)) != running.badBefore) revert InvalidBalanceDelta();
        RESERVE.forceApprove(address(AQUA), amountIn);
        AQUA.push(MAKER, address(SWAP_VM), ORDER_HASH, address(RESERVE), amountIn);
        RESERVE.forceApprove(address(AQUA), 0);
        if (RESERVE.balanceOf(address(this)) != reserveAfterSale - amountIn)
            revert InvalidBalanceDelta();
        _execution.payment = amountIn;
        _execution.phase = 3;
    }

    function preTransferOutCallback(address, address, address, address, uint256, uint256,
                                    bytes32, bytes calldata) external pure override {
        revert InvalidCallback();
    }
}
