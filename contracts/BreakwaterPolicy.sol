// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BreakwaterGuard} from "./BreakwaterGuard.sol";
import {IPriceOracle} from "@1inch/swap-vm/src/instructions/interfaces/IPriceOracle.sol";

/// @notice Immutable owner-selected policy for fee-bearing positions.
/// @dev Observation age is not a promise of current market price. Exits are
/// bounded relative to accepted observations, never a cap on total loss.
contract BreakwaterPolicy is BreakwaterGuard {
    uint256 public constant MAX_SAFE_USD = 1.02e18;
    uint256 public constant MIN_RESERVE_USD = 0.98e18;
    uint32 public immutable RESERVE_MAX_AGE;
    error UnsafeReserve(uint256 price);
    error UnsupportedAssetPremium(uint256 price);
    error UnsupportedPolicy();

    constructor(address vm, address asset, address reserve, IPriceOracle assetFeed,
        IPriceOracle reserveFeed, uint32 assetMaxAge, uint32 reserveMaxAge,
        uint64 trigger, uint16 discount)
        BreakwaterGuard(vm, asset, reserve, assetFeed, reserveFeed, assetMaxAge, trigger, discount) {
        // Supported stablecoin policy envelope; owners may tighten within it.
        if (reserveMaxAge == 0 || assetMaxAge > 25 hours || reserveMaxAge > 25 hours
            || trigger < 0.98e18 || discount > 100) revert UnsupportedPolicy();
        RESERVE_MAX_AGE = reserveMaxAge;
    }

    /// @notice Reverts on invalid/stale feeds or an unsafe reference asset.
    function snapshot() external view returns (bool healthy, uint256 assetUsd,
        uint256 reserveUsd, bytes32 commitment) {
        (assetUsd, reserveUsd, commitment) = _readOracleState();
        healthy = _isHealthy(assetUsd, reserveUsd, Math.mulDiv(assetUsd, 1e18, reserveUsd));
    }

    function _isHealthy(uint256 assetUsd, uint256 reserveUsd, uint256 ratio)
        internal view override returns (bool) {
        if (reserveUsd < MIN_RESERVE_USD || reserveUsd > MAX_SAFE_USD) revert UnsafeReserve(reserveUsd);
        if (assetUsd > MAX_SAFE_USD) revert UnsupportedAssetPremium(assetUsd);
        return assetUsd >= TRIGGER_RATIO_E18 && ratio >= TRIGGER_RATIO_E18;
    }

    function _healthyInstructionLength() internal pure override returns (uint16) {
        return 168; // six-byte official flat-input-fee instruction + 162-byte pegged curve
    }

    function _maxAge(IPriceOracle feed) internal view override returns (uint32) {
        return address(feed) == address(GOOD_USD_FEED) ? RESERVE_MAX_AGE : MAX_STALENESS;
    }
}
