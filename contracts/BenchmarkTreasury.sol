// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

// AI-assisted experimental comparator. Not a general wallet or audited module.
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {TakerTraitsLib} from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import {IUnwindV3Router, IUnwindSwapVMConfiguration} from "./BreakwaterUnwindExecutor.sol";

/// @notice One owner-authorized position and optional preauthorized replacement.
/// Keepers cannot choose a venue, recipient, arbitrary call or unauthorized order.
contract BenchmarkTreasury {
    using SafeERC20 for IERC20;
    address public immutable OWNER;
    IAqua public immutable AQUA;
    ISwapVM public immutable VM;
    IUnwindV3Router public immutable VENUE;
    IERC20 public immutable BAD;
    IERC20 public immutable RESERVE;
    uint24 public immutable FEE;
    bytes32 public activeHash;
    bytes32 public replacementHash;
    uint256 public rewardCap;
    bool private locked;
    error Unauthorized();
    error InvalidRequest();
    error InvalidSettlement();
    event DirectExit(uint256 sold, uint256 treasuryProceeds, uint256 keeperPayment, bool replaced);

    constructor(address owner, address aqua, address vm, address venue,
                address bad, address reserve, uint24 fee) {
        require(owner != address(0) && aqua.code.length > 0 && vm.code.length > 0 &&
            venue.code.length > 0 && bad.code.length > 0 && reserve.code.length > 0 && bad != reserve);
        require(IUnwindSwapVMConfiguration(vm).AQUA() == aqua);
        OWNER = owner; AQUA = IAqua(aqua); VM = ISwapVM(vm); VENUE = IUnwindV3Router(venue);
        BAD = IERC20(bad); RESERVE = IERC20(reserve); FEE = fee;
    }
    modifier onlyOwner() { if (msg.sender != OWNER) revert Unauthorized(); _; }
    modifier lock() { if (locked) revert InvalidRequest(); locked = true; _; locked = false; }

    function arm(ISwapVM.Order calldata order, bytes32 nextHash,
                 uint256 badAllocation, uint256 reserveAllocation, uint256 maxReward) external onlyOwner lock {
        if (activeHash != bytes32(0) || order.maker != address(this) || badAllocation == 0 || maxReward == 0)
            revert InvalidRequest();
        activeHash = VM.hash(order); replacementHash = nextHash; rewardCap = maxReward;
        if (nextHash == activeHash) revert InvalidRequest();
        if (BAD.balanceOf(address(this)) < badAllocation || RESERVE.balanceOf(address(this)) < reserveAllocation)
            revert InvalidRequest();
        BAD.forceApprove(address(AQUA), badAllocation);
        RESERVE.forceApprove(address(AQUA), type(uint256).max);
        AQUA.ship(address(VM), abi.encode(order), _tokens(), _amounts(badAllocation, reserveAllocation));
    }

    function cancel() external onlyOwner lock {
        AQUA.dock(address(VM), activeHash, _tokens());
        activeHash = bytes32(0); replacementHash = bytes32(0);
        BAD.forceApprove(address(AQUA), 0); RESERVE.forceApprove(address(AQUA), 0);
    }

    function withdraw(address token, address recipient, uint256 amount) external onlyOwner lock {
        if (activeHash != bytes32(0) || recipient == address(0) ||
            (token != address(BAD) && token != address(RESERVE))) revert InvalidRequest();
        IERC20(token).safeTransfer(recipient, amount);
    }

    /// @dev Quote the EXACT same guard/program as atomic clearing before docking.
    /// The current program determines eligible price/direction and observation freshness.
    function directExit(ISwapVM.Order calldata order, ISwapVM.Order calldata replacement,
                        uint256 quantity, uint256 reward, uint40 deadline, bytes32 commitment,
                        bool keepActive) external lock returns (uint256 proceeds) {
        if (quantity == 0 || reward > rewardCap || deadline < block.timestamp ||
            order.maker != address(this) || VM.hash(order) != activeHash ||
            (keepActive && (replacement.maker != address(this) || replacementHash == bytes32(0) ||
                           VM.hash(replacement) != replacementHash))) revert InvalidRequest();
        (uint256 allocatedBad, uint256 allocatedReserve) = AQUA.safeBalances(
            address(this), address(VM), activeHash, address(BAD), address(RESERVE));
        if (quantity > allocatedBad) revert InvalidRequest();
        TakerTraitsLib.Args memory args;
        args.taker = address(this); args.isExactIn = false; args.deadline = deadline;
        args.instructionsArgs = abi.encode(commitment);
        (uint256 floor, uint256 quotedOut,) = VM.quote(order, address(RESERVE), address(BAD),
            quantity, TakerTraitsLib.build(args));
        if (floor == 0 || quotedOut != quantity) revert InvalidRequest();
        uint256 badBefore = BAD.balanceOf(address(this));
        uint256 reserveBefore = RESERVE.balanceOf(address(this));
        AQUA.dock(address(VM), activeHash, _tokens());
        activeHash = bytes32(0);
        BAD.forceApprove(address(VENUE), quantity);
        uint256 output = VENUE.exactInputSingle(IUnwindV3Router.ExactInputSingleParams({
            tokenIn: address(BAD), tokenOut: address(RESERVE), fee: FEE, recipient: address(this),
            deadline: deadline, amountIn: quantity, amountOutMinimum: floor + reward, sqrtPriceLimitX96: 0
        }));
        BAD.forceApprove(address(VENUE), 0);
        uint256 afterSale = RESERVE.balanceOf(address(this));
        if (afterSale < reserveBefore + floor + reward || output != afterSale - reserveBefore ||
            BAD.balanceOf(address(this)) != badBefore - quantity) revert InvalidSettlement();
        proceeds = output - reward;
        if (reward != 0) RESERVE.safeTransfer(msg.sender, reward);
        if (RESERVE.balanceOf(address(this)) != reserveBefore + proceeds) revert InvalidSettlement();
        if (keepActive) {
            AQUA.ship(address(VM), abi.encode(replacement), _tokens(),
                _amounts(allocatedBad - quantity, allocatedReserve + proceeds));
            activeHash = replacementHash;
        } else {
            BAD.forceApprove(address(AQUA), 0); RESERVE.forceApprove(address(AQUA), 0);
        }
        replacementHash = bytes32(0);
        emit DirectExit(quantity, proceeds, reward, keepActive);
    }

    function _tokens() private view returns (address[] memory t) {
        t = new address[](2); t[0] = address(BAD); t[1] = address(RESERVE);
    }
    function _amounts(uint256 a, uint256 b) private pure returns (uint256[] memory v) {
        v = new uint256[](2); v[0] = a; v[1] = b;
    }
}
