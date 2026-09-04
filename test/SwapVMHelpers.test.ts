// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// © 2026 Breakwater contributors.

import { expect } from "chai";
import { HexString, TakerTraits } from "@1inch/swap-vm-sdk";

import { TakerTraitsLib } from "./utils/SwapVMHelpers";

describe("SwapVM SDK integration", function () {
  it("preserves commitment, threshold, and deadline in official v0.4.1 encoding", function () {
    const commitment = `0x${"11".repeat(32)}`;
    const packed = TakerTraitsLib.build({
      isExactIn: false,
      threshold: 123_456n,
      deadline: 1_800_000_000n,
      useTransferFromAndAquaPush: true,
      instructionsArgs: commitment
    });

    const decoded = TakerTraits.decode(new HexString(packed));
    expect(decoded.exactIn).to.equal(false);
    expect(decoded.threshold).to.equal(123_456n);
    expect(decoded.deadline).to.equal(1_800_000_000n);
    expect(decoded.useTransferFromAndAquaPush).to.equal(true);
    expect(decoded.instructionsArgs.toString()).to.equal(commitment);
  });

  it("rejects values the on-chain taker-traits decoder cannot represent", function () {
    expect(() => TakerTraitsLib.build({ deadline: 1n << 40n }))
      .to.throw("deadline must fit into uint40");
    expect(() => TakerTraitsLib.build({ threshold: 1n << 256n }))
      .to.throw("threshold must fit into uint256");
    expect(() => TakerTraitsLib.build({ threshold: -1n }))
      .to.throw("threshold must fit into uint256");
  });
});
