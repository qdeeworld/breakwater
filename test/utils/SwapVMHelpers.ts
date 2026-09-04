// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1

import { BigNumberish } from "ethers";
import { TakerTraits } from "@1inch/swap-vm-sdk";

interface TakerTraitsArgs {
  taker?: string;
  isExactIn?: boolean;
  shouldUnwrapWeth?: boolean;
  isStrictThresholdAmount?: boolean;
  isFirstTransferFromTaker?: boolean;
  useTransferFromAndAquaPush?: boolean;
  hasPreTransferInCallback?: boolean;
  hasPreTransferOutCallback?: boolean;
  threshold?: BigNumberish;
}

/** Thin compatibility wrapper around the official v0.4.1 SwapVM SDK. */
class TakerTraitsLib {
  static build(args: TakerTraitsArgs): string {
    return TakerTraits.new({
      exactIn: args.isExactIn ?? true,
      shouldUnwrap: args.shouldUnwrapWeth ?? false,
      strictThreshold: args.isStrictThresholdAmount ?? false,
      firstTransferFromTaker: args.isFirstTransferFromTaker ?? false,
      useTransferFromAndAquaPush: args.useTransferFromAndAquaPush ?? false,
      preTransferInCallbackEnabled: args.hasPreTransferInCallback ?? false,
      preTransferOutCallbackEnabled: args.hasPreTransferOutCallback ?? false,
      threshold: args.threshold === undefined ? 0n : BigInt(args.threshold.toString())
    }).encode().toString();
  }
}

export { TakerTraitsLib, TakerTraitsArgs };
