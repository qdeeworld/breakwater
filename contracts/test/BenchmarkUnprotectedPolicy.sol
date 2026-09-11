// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

import {BreakwaterGuard} from "../BreakwaterGuard.sol";
import {IPriceOracle} from "@1inch/swap-vm/src/instructions/interfaces/IPriceOracle.sol";

/// @dev EXPERIMENT ONLY: no depeg protection. Never deploy for a user position.
/// Keeps the production fee/curve path and feed-validity checks, including ages.
contract BenchmarkUnprotectedPolicy is BreakwaterGuard {
    constructor(address vm,address asset,address reserve,IPriceOracle af,IPriceOracle rf)
        BreakwaterGuard(vm,asset,reserve,af,rf,86400,0.98e18,50) {}

    function snapshot() external view returns(bool,uint256,uint256,bytes32) {
        (uint256 a,uint256 r,bytes32 c)=_readOracleState();
        return (true,a,r,c);
    }
    function _isHealthy(uint256,uint256,uint256) internal pure override returns(bool) { return true; }
    function _healthyInstructionLength() internal pure override returns(uint16) { return 168; }
    function _maxAge(IPriceOracle feed) internal view override returns(uint32) {
        return address(feed)==address(GOOD_USD_FEED)?90000:86400;
    }
}
