// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {MakerTraits} from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import {IPriceOracle} from "@1inch/swap-vm/src/instructions/interfaces/IPriceOracle.sol";
import {BreakwaterPolicy} from "./BreakwaterPolicy.sol";
import {BreakwaterMakerAMM} from "./BreakwaterMakerAMM.sol";
import {BreakwaterScenario} from "./BreakwaterScenario.sol";

/// @notice Permissionless owner-created order directory and settlement ledger.
/// Assets remain in the maker's wallet. Only the owner can approve/ship/dock in
/// Aqua; this contract cannot move assets, cancel orders, or grant spending rights.
contract BreakwaterPositions {
    ISwapVM public immutable SWAP_VM;
    BreakwaterMakerAMM public immutable BUILDER;
    address public immutable ASSET;
    address public immutable RESERVE;
    uint256 private immutable _assetRate;
    uint256 private immutable _reserveRate;
    struct Settings {
        uint256 assetAllocation;
        uint256 reserveAllocation;
        uint16 feeBps;
        uint64 trigger;
        uint16 discountBps;
        uint32 assetMaxAge;
        uint32 reserveMaxAge;
    }
    struct Position {
        address owner;
        BreakwaterPolicy policy;
        address scenario;
        uint256 assetAllocation;
        uint256 reserveAllocation;
        uint16 feeBps;
        bytes orderData;
        uint256 orderTraits;
    }
    struct Accounting {
        uint256 assetFees;
        uint256 reserveFees;
        uint256 healthyTrades;
        uint256 exitTrades;
        uint256 assetExited;
        uint256 reserveProceeds;
    }
    mapping(bytes32 => Position) private _positions;
    mapping(address => bytes32[]) private _ownerPositions;
    mapping(bytes32 => Accounting) public accounting;
    // Two transfer boundaries authenticate one observation and count once.
    // Cleared by the second boundary; reverted settlements roll all writes back.
    mapping(bytes32 => bytes32) private _pendingObservation;
    uint64 private _nonce;
    error InvalidConfiguration();
    error UnauthorizedHook();
    error ObservationChangedDuringSettlement();
    event PositionCreated(bytes32 indexed orderHash, address indexed owner, address policy, address scenario);
    event HealthyFeeEarned(bytes32 indexed orderHash, address indexed token, uint256 amount, uint256 grossInput);
    event ExitSettled(bytes32 indexed orderHash, uint256 assetSold, uint256 reserveReceived);

    constructor(ISwapVM vm, BreakwaterMakerAMM builder, address asset, address reserve) {
        if (address(vm) == address(0) || address(builder) == address(0) || asset == reserve
            || asset == address(0) || reserve == address(0)) revert InvalidConfiguration();
        uint8 a = IERC20Metadata(asset).decimals();
        uint8 r = IERC20Metadata(reserve).decimals();
        if (a > 18 || r > 18) revert InvalidConfiguration();
        SWAP_VM = vm; BUILDER = builder; ASSET = asset; RESERVE = reserve;
        _assetRate = 10 ** (18-a); _reserveRate = 10 ** (18-r);
    }

    /// @notice Feed trust belongs to the owner. Registration is not feed endorsement.
    function create(Settings calldata s, IPriceOracle assetFeed, IPriceOracle reserveFeed)
        external returns (bytes32) {
        return _create(s,assetFeed,reserveFeed,address(0));
    }

    /// @notice No-value testnet lifecycle with observations controlled only by this owner.
    function createDemo(Settings calldata s) external returns (bytes32) {
        BreakwaterScenario scenario = new BreakwaterScenario(msg.sender);
        return _create(s,IPriceOracle(address(scenario.ASSET_FEED())),
            IPriceOracle(address(scenario.RESERVE_FEED())),address(scenario));
    }

    function _create(Settings calldata s, IPriceOracle assetFeed, IPriceOracle reserveFeed,
        address scenario) private returns (bytes32 hash) {
        BreakwaterPolicy policy = new BreakwaterPolicy(address(SWAP_VM),ASSET,RESERVE,
            assetFeed,reserveFeed,s.assetMaxAge,s.reserveMaxAge,s.trigger,s.discountBps);
        ISwapVM.Order memory order = BUILDER.build(BreakwaterMakerAMM.Config({
            maker:msg.sender, asset:ASSET, reserve:RESERVE, policy:address(policy), ledger:address(this),
            assetAllocation:s.assetAllocation, reserveAllocation:s.reserveAllocation,
            assetRate:_assetRate, reserveRate:_reserveRate, feeBps:s.feeBps, salt:++_nonce
        }));
        hash = SWAP_VM.hash(order);
        _positions[hash] = Position(msg.sender,policy,scenario,s.assetAllocation,s.reserveAllocation,
            s.feeBps,order.data,MakerTraits.unwrap(order.traits));
        _ownerPositions[msg.sender].push(hash);
        emit PositionCreated(hash,msg.sender,address(policy),scenario);
    }

    function position(bytes32 hash) external view returns (Position memory) { return _positions[hash]; }
    function ownerPositionCount(address owner) external view returns (uint256) { return _ownerPositions[owner].length; }
    function ownerPositionAt(address owner, uint256 index) external view returns (bytes32) { return _ownerPositions[owner][index]; }

    function preTransferIn(address maker,address,address tokenIn,address tokenOut,uint256 amountIn,
        uint256 amountOut,bytes32 hash,bytes calldata,bytes calldata) external {
        _account(maker,tokenIn,tokenOut,amountIn,amountOut,hash);
    }
    function preTransferOut(address maker,address,address tokenIn,address tokenOut,uint256 amountIn,
        uint256 amountOut,bytes32 hash,bytes calldata,bytes calldata) external {
        _account(maker,tokenIn,tokenOut,amountIn,amountOut,hash);
    }
    function _account(address maker,address tokenIn,address tokenOut,uint256 amountIn,
        uint256 amountOut,bytes32 hash) private {
        Position storage p = _positions[hash];
        if (msg.sender != address(SWAP_VM) || p.owner == address(0) || maker != p.owner
            || !((tokenIn == ASSET && tokenOut == RESERVE) || (tokenIn == RESERVE && tokenOut == ASSET)))
            revert UnauthorizedHook();
        (bool healthy,,,bytes32 observation) = p.policy.snapshot();
        bytes32 pending = _pendingObservation[hash];
        if (pending != bytes32(0)) {
            if (pending != observation) revert ObservationChangedDuringSettlement();
            delete _pendingObservation[hash];
            return;
        }
        _pendingObservation[hash] = observation;
        Accounting storage a = accounting[hash];
        if (healthy) {
            // Exact input: ceil(gross*f/B). Exact output: net+ceil(net*f/(B-f))
            // also yields fee=ceil(gross*f/B). Both use the actual gross settlement.
            uint256 fee = Math.mulDiv(amountIn,p.feeBps,10_000,Math.Rounding.Ceil);
            if (tokenIn == ASSET) a.assetFees += fee; else a.reserveFees += fee;
            a.healthyTrades++;
            emit HealthyFeeEarned(hash,tokenIn,fee,amountIn);
        } else {
            if (tokenIn != RESERVE) revert UnauthorizedHook();
            a.exitTrades++; a.assetExited += amountOut; a.reserveProceeds += amountIn;
            emit ExitSettled(hash,amountOut,amountIn);
        }
    }
}
