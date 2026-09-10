// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;
// AI-assisted experimental explicit USD boundary. Not deployed or audited.
import {BreakwaterGuard} from "./BreakwaterGuard.sol";
import {IPriceOracle} from "@1inch/swap-vm/src/instructions/interfaces/IPriceOracle.sol";

contract BreakwaterUsdGuard is BreakwaterGuard {
    uint256 public constant MIN_SAFE_USD = 0.98e18;
    uint256 public constant MAX_SAFE_USD = 1.02e18;
    error UnsafeReserve(uint256 price);
    error UnsupportedAssetPremium(uint256 price);
    error ExcessiveObservationAge();

    constructor(address vm, address bad, address reserve, IPriceOracle badFeed, IPriceOracle reserveFeed,
                uint32 maxAge, uint64 relativeTrigger, uint16 discount)
        BreakwaterGuard(vm,bad,reserve,badFeed,reserveFeed,maxAge,relativeTrigger,discount) {
        // Deliberately conservative experiment policy, not tuned to pass old exits.
        // Feed availability under this policy must be measured before release.
        if (maxAge > 3600) revert ExcessiveObservationAge();
    }
    function _isHealthy(uint256 badUsd, uint256 reserveUsd, uint256 ratio)
        internal view override returns (bool) {
        if (reserveUsd < MIN_SAFE_USD || reserveUsd > MAX_SAFE_USD) revert UnsafeReserve(reserveUsd);
        if (badUsd > MAX_SAFE_USD) revert UnsupportedAssetPremium(badUsd);
        return badUsd >= MIN_SAFE_USD && ratio >= TRIGGER_RATIO_E18;
    }
}
