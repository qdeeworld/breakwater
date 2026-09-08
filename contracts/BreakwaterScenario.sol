// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @notice TESTNET ONLY, owner-controlled observations, not market data.
contract BreakwaterScenarioFeed {
    address public immutable CONTROLLER;
    uint8 public constant decimals = 8;
    uint80 private _round;
    int256 private _answer;
    uint256 private _updated;
    constructor() { CONTROLLER = msg.sender; }
    function set(int256 answer) external {
        require(msg.sender == CONTROLLER, "Only scenario controller");
        _round++; _answer = answer; _updated = block.timestamp;
    }
    function description() external pure returns (string memory) { return "Breakwater TESTNET scenario; not market data"; }
    function version() external pure returns (uint256) { return 1; }
    function latestRoundData() external view returns (uint80,int256,uint256,uint256,uint80) {
        return (_round,_answer,_updated,_updated,_round);
    }
    function getRoundData(uint80 round) external view returns (uint80,int256,uint256,uint256,uint80) {
        require(round == _round, "No historical data");
        return (_round,_answer,_updated,_updated,_round);
    }
}

contract BreakwaterScenario {
    address public immutable OWNER;
    BreakwaterScenarioFeed public immutable ASSET_FEED;
    BreakwaterScenarioFeed public immutable RESERVE_FEED;
    uint8 public scenario;
    event ScenarioChanged(uint8 scenario);
    constructor(address owner) {
        require(block.chainid == 31337 || block.chainid == 11155111, "Test networks only");
        OWNER = owner;
        ASSET_FEED = new BreakwaterScenarioFeed();
        RESERVE_FEED = new BreakwaterScenarioFeed();
        _set(0);
    }
    /// @param state 0 healthy, 1 asset stressed, 2 reserve unsafe, 3 both unsafe.
    /// Calling again refreshes the labeled sample observations; never automatic.
    function setScenario(uint8 state) external {
        require(msg.sender == OWNER, "Only position owner");
        _set(state);
    }
    function _set(uint8 state) private {
        require(state <= 3, "Unknown scenario");
        scenario = state;
        ASSET_FEED.set(state == 1 || state == 3 ? int256(94_000_000) : int256(100_000_000));
        RESERVE_FEED.set(state >= 2 ? int256(94_000_000) : int256(100_000_000));
        emit ScenarioChanged(state);
    }
}
