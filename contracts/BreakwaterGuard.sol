// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm-template/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2026 Breakwater contributors

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {
    IExtruction,
    IStaticExtruction
} from "@1inch/swap-vm/src/instructions/Extruction.sol";
import { IPriceOracle } from "@1inch/swap-vm/src/instructions/interfaces/IPriceOracle.sol";
import { SwapQuery, SwapRegisters } from "@1inch/swap-vm/src/libs/VM.sol";

/// @title BreakwaterGuard
/// @notice Stateless SwapVM extruction that stops a maker accumulating a depegged asset while preserving an oracle-priced unwind.
contract BreakwaterGuard is IExtruction, IStaticExtruction {
    uint256 private constant _ONE = 1e18;
    uint256 private constant _BPS = 10_000;
    uint8 private constant _MAX_DECIMALS = 18;
    uint16 private constant _PEGGED_INSTRUCTION_LENGTH = 162;

    address public immutable SWAP_VM;
    address public immutable BAD_TOKEN;
    address public immutable GOOD_TOKEN;
    IPriceOracle public immutable BAD_USD_FEED;
    IPriceOracle public immutable GOOD_USD_FEED;
    uint32 public immutable MAX_STALENESS;
    uint64 public immutable TRIGGER_RATIO_E18;
    uint16 public immutable UNWIND_DISCOUNT_BPS;
    uint8 public immutable BAD_TOKEN_DECIMALS;
    uint8 public immutable GOOD_TOKEN_DECIMALS;

    error ZeroAddress();
    error IdenticalTokens();
    error InvalidMaxStaleness();
    error InvalidTriggerRatio(uint256 ratio);
    error InvalidDiscount(uint256 discountBps);
    error UnsupportedTokenDecimals(address token, uint8 decimals);
    error UnsupportedFeedDecimals(address feed, uint8 decimals);
    error UnauthorizedCaller(address caller);
    error InvalidInstructionArgsLength(uint256 length);
    error InvalidPeggedInstructionLength(uint256 length);
    error InvalidPair(address tokenIn, address tokenOut);
    error InvalidFeedRound(address feed, uint80 roundId, uint80 answeredInRound);
    error InvalidFeedAnswer(address feed, int256 answer);
    error InvalidFeedTimestamp(address feed, uint256 startedAt, uint256 updatedAt);
    error FeedTimestampInFuture(address feed, uint256 updatedAt, uint256 currentTime);
    error StaleFeed(address feed, uint256 updatedAt, uint256 currentTime, uint256 maxStaleness);
    error ToxicDirectionBlocked(address badToken);
    error ZeroUnwindPrice();
    error ZeroSwapAmount();
    error InsufficientBadTokenLiquidity(uint256 requested, uint256 available);

    constructor(
        address swapVM,
        address badToken,
        address goodToken,
        IPriceOracle badUsdFeed,
        IPriceOracle goodUsdFeed,
        uint32 maxStaleness,
        uint64 triggerRatioE18,
        uint16 unwindDiscountBps
    ) {
        if (
            swapVM == address(0) || badToken == address(0) || goodToken == address(0)
                || address(badUsdFeed) == address(0) || address(goodUsdFeed) == address(0)
        ) revert ZeroAddress();
        if (badToken == goodToken) revert IdenticalTokens();
        if (maxStaleness == 0) revert InvalidMaxStaleness();
        if (triggerRatioE18 == 0 || triggerRatioE18 > _ONE) {
            revert InvalidTriggerRatio(triggerRatioE18);
        }
        if (unwindDiscountBps >= _BPS) revert InvalidDiscount(unwindDiscountBps);

        uint8 badTokenDecimals = IERC20Metadata(badToken).decimals();
        uint8 goodTokenDecimals = IERC20Metadata(goodToken).decimals();
        if (badTokenDecimals > _MAX_DECIMALS) {
            revert UnsupportedTokenDecimals(badToken, badTokenDecimals);
        }
        if (goodTokenDecimals > _MAX_DECIMALS) {
            revert UnsupportedTokenDecimals(goodToken, goodTokenDecimals);
        }

        SWAP_VM = swapVM;
        BAD_TOKEN = badToken;
        GOOD_TOKEN = goodToken;
        BAD_USD_FEED = badUsdFeed;
        GOOD_USD_FEED = goodUsdFeed;
        MAX_STALENESS = maxStaleness;
        TRIGGER_RATIO_E18 = triggerRatioE18;
        UNWIND_DISCOUNT_BPS = unwindDiscountBps;
        BAD_TOKEN_DECIMALS = badTokenDecimals;
        GOOD_TOKEN_DECIMALS = goodTokenDecimals;
    }

    /// @inheritdoc IExtruction
    /// @dev A single view implementation serves both quote and swap modes, preventing mode-dependent state divergence.
    function extruction(
        bool,
        uint256 nextPC,
        SwapQuery calldata query,
        SwapRegisters calldata swap,
        bytes calldata args,
        bytes calldata
    ) external view override(IExtruction, IStaticExtruction) returns (
        uint256 updatedNextPC,
        uint256 choppedLength,
        SwapRegisters memory updatedSwap
    ) {
        if (msg.sender != SWAP_VM) revert UnauthorizedCaller(msg.sender);
        if (args.length != 2) revert InvalidInstructionArgsLength(args.length);
        uint16 peggedInstructionLength = uint16(bytes2(args));
        if (peggedInstructionLength != _PEGGED_INSTRUCTION_LENGTH) {
            revert InvalidPeggedInstructionLength(peggedInstructionLength);
        }
        if (
            !(
                (query.tokenIn == BAD_TOKEN && query.tokenOut == GOOD_TOKEN)
                    || (query.tokenIn == GOOD_TOKEN && query.tokenOut == BAD_TOKEN)
            )
        ) revert InvalidPair(query.tokenIn, query.tokenOut);

        updatedNextPC = nextPC;
        updatedSwap = swap;

        uint256 badUsdE18 = _readUsdPrice(BAD_USD_FEED);
        uint256 goodUsdE18 = _readUsdPrice(GOOD_USD_FEED);
        // USD value of one BAD token, denominated in GOOD token units.
        uint256 goodPerBadE18 = Math.mulDiv(
            badUsdE18,
            _ONE,
            goodUsdE18,
            Math.Rounding.Ceil
        );

        // Preserve the upstream pegged curve while both assets remain inside the configured safety band.
        if (goodPerBadE18 >= TRIGGER_RATIO_E18) return (updatedNextPC, 0, updatedSwap);

        // tokenIn is pushed to the maker's Aqua balance. Accepting BAD_TOKEN here would increase impaired exposure.
        if (query.tokenIn == BAD_TOKEN) revert ToxicDirectionBlocked(BAD_TOKEN);

        uint256 unwindPriceE18 = Math.mulDiv(
            goodPerBadE18,
            _BPS - UNWIND_DISCOUNT_BPS,
            _BPS,
            Math.Rounding.Ceil
        );
        if (unwindPriceE18 == 0) revert ZeroUnwindPrice();

        uint256 badScale = 10 ** BAD_TOKEN_DECIMALS;
        uint256 goodScale = 10 ** GOOD_TOKEN_DECIMALS;

        if (query.isExactIn) {
            // good token in -> bad token out, rounded down to protect the maker.
            updatedSwap.amountOut = Math.mulDiv(
                swap.amountIn,
                badScale * _ONE,
                goodScale * unwindPriceE18
            );
        } else {
            // Exact bad-token output, with good-token input rounded up to protect the maker.
            updatedSwap.amountIn = Math.mulDiv(
                swap.amountOut,
                goodScale * unwindPriceE18,
                badScale * _ONE,
                Math.Rounding.Ceil
            );
        }

        if (updatedSwap.amountIn == 0 || updatedSwap.amountOut == 0) revert ZeroSwapAmount();
        if (updatedSwap.amountOut > swap.balanceOut) {
            revert InsufficientBadTokenLiquidity(updatedSwap.amountOut, swap.balanceOut);
        }

        // The guard precedes PeggedSwap. In stress it has produced the complete
        // oracle-priced quote, so skip the pegged instruction rather than let
        // that curve reject a valid exposure-reducing exit at an imbalanced state.
        updatedNextPC += peggedInstructionLength;

        return (updatedNextPC, 0, updatedSwap);
    }

    function _readUsdPrice(IPriceOracle feed) private view returns (uint256 priceE18) {
        uint8 feedDecimals = feed.decimals();
        if (feedDecimals > _MAX_DECIMALS) {
            revert UnsupportedFeedDecimals(address(feed), feedDecimals);
        }

        (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = feed.latestRoundData();

        if (roundId == 0 || answeredInRound < roundId) {
            revert InvalidFeedRound(address(feed), roundId, answeredInRound);
        }
        if (answer <= 0) revert InvalidFeedAnswer(address(feed), answer);
        if (startedAt == 0 || updatedAt == 0 || updatedAt < startedAt) {
            revert InvalidFeedTimestamp(address(feed), startedAt, updatedAt);
        }
        if (updatedAt > block.timestamp) {
            revert FeedTimestampInFuture(address(feed), updatedAt, block.timestamp);
        }
        if (block.timestamp - updatedAt > MAX_STALENESS) {
            revert StaleFeed(address(feed), updatedAt, block.timestamp, MAX_STALENESS);
        }

        priceE18 = uint256(answer) * (10 ** (_MAX_DECIMALS - feedDecimals));
    }
}
