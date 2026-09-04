// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm-template/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2026 Breakwater contributors

import { IPriceOracle } from "@1inch/swap-vm/src/instructions/interfaces/IPriceOracle.sol";

/// @title DemoPriceFeed
/// @notice TESTNET ONLY: immutable Aggregator V3-compatible observation for the public Breakwater demo.
/// @dev Unlike MockPriceFeed, no account can mutate or invalidate this observation after deployment.
contract DemoPriceFeed is IPriceOracle {
    uint80 private constant _ROUND_ID = 1;

    uint8 public immutable override decimals;
    int256 private immutable _answer;
    uint256 private immutable _observedAt;
    string private _description;

    error InvalidDecimals(uint8 decimals);
    error InvalidAnswer(int256 answer);
    error NoDataPresent(uint80 roundId);

    constructor(uint8 decimals_, int256 answer_, string memory description_) {
        if (decimals_ > 18) revert InvalidDecimals(decimals_);
        if (answer_ <= 0) revert InvalidAnswer(answer_);
        decimals = decimals_;
        _answer = answer_;
        _description = description_;
        _observedAt = block.timestamp;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 roundId) external view override returns (
        uint80,
        int256,
        uint256,
        uint256,
        uint80
    ) {
        if (roundId != _ROUND_ID) revert NoDataPresent(roundId);
        return (_ROUND_ID, _answer, _observedAt, _observedAt, _ROUND_ID);
    }

    function latestRoundData() external view override returns (
        uint80,
        int256,
        uint256,
        uint256,
        uint80
    ) {
        return (_ROUND_ID, _answer, _observedAt, _observedAt, _ROUND_ID);
    }
}
