// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm-template/blob/main/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2026 Breakwater contributors

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title DemoFaucetToken
/// @notice TESTNET ONLY: fixed reserve supply plus a bounded, one-claim-per-address faucet.
/// @dev No account can mint beyond the constructor reserve and global faucet allocation.
contract DemoFaucetToken is ERC20 {
    uint8 private immutable _tokenDecimals;

    uint256 public immutable FAUCET_AMOUNT;
    uint256 public immutable FAUCET_SUPPLY_CAP;
    uint256 public faucetSupplyClaimed;

    mapping(address account => bool hasClaimed) public hasClaimed;

    error InvalidFaucetConfiguration(uint256 amount, uint256 cap);
    error FaucetAlreadyClaimed(address account);
    error FaucetExhausted(uint256 requested, uint256 remaining);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 reserveSupply_,
        uint256 faucetAmount_,
        uint256 faucetSupplyCap_
    ) ERC20(name_, symbol_) {
        if (faucetAmount_ == 0 || faucetSupplyCap_ < faucetAmount_) {
            revert InvalidFaucetConfiguration(faucetAmount_, faucetSupplyCap_);
        }
        _tokenDecimals = decimals_;
        FAUCET_AMOUNT = faucetAmount_;
        FAUCET_SUPPLY_CAP = faucetSupplyCap_;
        _mint(msg.sender, reserveSupply_);
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    /// @notice Claims the fixed public test amount once for the calling address.
    function claim() external {
        if (hasClaimed[msg.sender]) revert FaucetAlreadyClaimed(msg.sender);
        uint256 remaining = FAUCET_SUPPLY_CAP - faucetSupplyClaimed;
        if (FAUCET_AMOUNT > remaining) {
            revert FaucetExhausted(FAUCET_AMOUNT, remaining);
        }

        hasClaimed[msg.sender] = true;
        faucetSupplyClaimed += FAUCET_AMOUNT;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
