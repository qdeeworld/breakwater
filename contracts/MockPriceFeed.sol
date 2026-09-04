// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm-template/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2026 Breakwater contributors

import { IPriceOracle } from "@1inch/swap-vm/src/instructions/interfaces/IPriceOracle.sol";

/// @title MockPriceFeed
/// @notice TEST ONLY: controllable Aggregator V3-compatible feed for boundary and failure-path tests.
contract MockPriceFeed is IPriceOracle {
    uint8 public immutable override decimals;

    string private _description;
    uint80 private _roundId;
    int256 private _answer;
    uint256 private _startedAt;
    uint256 private _updatedAt;
    uint80 private _answeredInRound;

    error NoDataPresent(uint80 roundId);

    constructor(uint8 decimals_, int256 initialAnswer) {
        decimals = decimals_;
        _description = "Breakwater Mock USD Feed";
        _roundId = 1;
        _answer = initialAnswer;
        _startedAt = block.timestamp;
        _updatedAt = block.timestamp;
        _answeredInRound = 1;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function setAnswer(int256 answer) external {
        unchecked {
            ++_roundId;
        }
        _answer = answer;
        _startedAt = block.timestamp;
        _updatedAt = block.timestamp;
        _answeredInRound = _roundId;
    }

    function setRoundData(
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) external {
        _roundId = roundId;
        _answer = answer;
        _startedAt = startedAt;
        _updatedAt = updatedAt;
        _answeredInRound = answeredInRound;
    }

    function getRoundData(uint80 roundId) external view override returns (
        uint80,
        int256,
        uint256,
        uint256,
        uint80
    ) {
        if (roundId != _roundId) revert NoDataPresent(roundId);
        return (_roundId, _answer, _startedAt, _updatedAt, _answeredInRound);
    }

    function latestRoundData() external view override returns (
        uint80,
        int256,
        uint256,
        uint256,
        uint80
    ) {
        return (_roundId, _answer, _startedAt, _updatedAt, _answeredInRound);
    }
}
