// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1

import { BigNumberish } from "ethers";
import { HexString, TakerTraits } from "@1inch/swap-vm-sdk";

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
  deadline?: BigNumberish;
  instructionsArgs?: string;
}

function boundedUint(value: BigNumberish | undefined, bits: bigint, name: string): bigint {
  const parsed = value === undefined ? 0n : BigInt(value.toString());
  const max = (1n << bits) - 1n;
  if (parsed < 0n || parsed > max) {
    throw new RangeError(`${name} must fit into uint${bits}`);
  }
  return parsed;
}

/** Thin compatibility wrapper around the official v0.4.1 SwapVM SDK. */
class TakerTraitsLib {
  static build(args: TakerTraitsArgs): string {
    const threshold = boundedUint(args.threshold, 256n, "threshold");
    const deadline = boundedUint(args.deadline, 40n, "deadline");
    return TakerTraits.new({
      exactIn: args.isExactIn ?? true,
      shouldUnwrap: args.shouldUnwrapWeth ?? false,
      strictThreshold: args.isStrictThresholdAmount ?? false,
      firstTransferFromTaker: args.isFirstTransferFromTaker ?? false,
      useTransferFromAndAquaPush: args.useTransferFromAndAquaPush ?? false,
      preTransferInCallbackEnabled: args.hasPreTransferInCallback ?? false,
      preTransferOutCallbackEnabled: args.hasPreTransferOutCallback ?? false,
      threshold,
      deadline,
      instructionsArgs: args.instructionsArgs === undefined
        ? HexString.EMPTY
        : new HexString(args.instructionsArgs, "instructionsArgs")
    }).encode().toString();
  }
}

export { TakerTraitsLib, TakerTraitsArgs };
