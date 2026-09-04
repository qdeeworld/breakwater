'use client';

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  Waves,
  X,
} from 'lucide-react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  isAddress as isViemAddress,
  isHex as isViemHex,
  parseEventLogs,
  parseUnits,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  TARGET_CHAIN_ID,
  TARGET_NETWORK,
  aquaAbi,
  buildTakerTraits,
  deployment,
  describeError,
  erc20Abi,
  feedAbi,
  guardAbi,
  routerAbi,
  scaleFeedAnswer,
  shortenHex,
} from '@/lib/breakwater';

const publicClient = createPublicClient({ chain: sepolia, transport: http() });
const QUOTE_LIFETIME_SECONDS = 10 * 60;
const SLIPPAGE_BPS = 50n;
const BPS = 10_000n;
const PENDING_SWAP_KEY = 'breakwater:pending-swap:v1';

type AsyncPhase =
  | 'idle'
  | 'connecting'
  | 'switching'
  | 'claiming'
  | 'quoting'
  | 'approving'
  | 'swapping';

type MarketSnapshot = {
  badSymbol: string;
  goodSymbol: string;
  badDecimals: number;
  goodDecimals: number;
  badPriceE18: bigint;
  goodPriceE18: bigint;
  ratioE18: bigint;
  triggerE18: bigint;
  discountBps: number;
  maxStaleness: number;
  oldestUpdate: number;
  commitment: Hex;
  orderHash: Hex;
  badLiquidity: bigint;
  goodLiquidity: bigint;
};

type UserSnapshot = {
  goodBalance: bigint;
  badBalance: bigint;
  allowance: bigint;
};

type Quote = {
  amountIn: bigint;
  amountOut: bigint;
  minimumOut: bigint;
  deadline: bigint;
  commitment: Hex;
  traits: Hex;
};

type Receipt = {
  hash: Hex;
  amountIn: bigint;
  amountOut: bigint;
  impairedExposureRemoved: bigint;
};

type PendingSwap = {
  hash: Hex;
  account: Address;
  orderHash: Hex;
};

type BrowserEthereum = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
};

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => Promise<Record<string, unknown>>;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};

function getEthereum(): BrowserEthereum | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { ethereum?: BrowserEthereum }).ethereum;
}

function formatToken(value: bigint | undefined, decimals = 6, digits = 2) {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(formatUnits(value, decimals)));
}

function formatRatio(value: bigint | undefined) {
  return value === undefined ? '—' : Number(formatUnits(value, 18)).toFixed(4);
}

function timeAgo(timestamp: number) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

async function waitForSuccessfulReceipt(hash: Hex) {
  let unsafeReplacement: 'cancelled' | 'replaced' | undefined;
  const transactionReceipt = await publicClient.waitForTransactionReceipt({
    hash,
    onReplaced(replacement) {
      if (replacement.reason !== 'repriced') {
        unsafeReplacement = replacement.reason;
      }
    },
  });
  if (unsafeReplacement) {
    throw new Error(
      unsafeReplacement === 'cancelled'
        ? 'The submitted transaction was cancelled in the wallet.'
        : 'The submitted transaction was replaced with a different action.',
    );
  }
  if (transactionReceipt.status !== 'success') {
    throw new Error('The transaction reverted after it was mined.');
  }
  return transactionReceipt;
}

function readPendingSwap(): PendingSwap | undefined {
  if (typeof window === 'undefined' || !deployment) return undefined;
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(PENDING_SWAP_KEY) ?? 'null',
    );
    if (
      typeof value !== 'object' ||
      value === null ||
      !('hash' in value) ||
      !('account' in value) ||
      !('orderHash' in value) ||
      typeof value.hash !== 'string' ||
      typeof value.account !== 'string' ||
      typeof value.orderHash !== 'string' ||
      !isViemHex(value.hash) ||
      !isViemAddress(value.account) ||
      !isViemHex(value.orderHash) ||
      value.orderHash.toLowerCase() !== deployment.orderHash.toLowerCase()
    ) {
      window.localStorage.removeItem(PENDING_SWAP_KEY);
      return undefined;
    }
    return {
      hash: value.hash,
      account: value.account,
      orderHash: value.orderHash,
    };
  } catch {
    window.localStorage.removeItem(PENDING_SWAP_KEY);
    return undefined;
  }
}

function rememberPendingSwap(pendingSwap: PendingSwap) {
  try {
    window.localStorage.setItem(PENDING_SWAP_KEY, JSON.stringify(pendingSwap));
  } catch {
    // React state still locks the ticket if browser storage is unavailable.
  }
}

function forgetPendingSwap() {
  try {
    window.localStorage.removeItem(PENDING_SWAP_KEY);
  } catch {
    // The in-memory lock is cleared independently.
  }
}

export function BreakwaterConsole() {
  const [phase, setPhase] = useState<AsyncPhase>('idle');
  const [account, setAccount] = useState<Address>();
  const [walletChainId, setWalletChainId] = useState<number>();
  const [amount, setAmount] = useState('10');
  const [market, setMarket] = useState<MarketSnapshot>();
  const [user, setUser] = useState<UserSnapshot>();
  const [quote, setQuote] = useState<Quote>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [pendingSwap, setPendingSwap] = useState<PendingSwap>();
  const [notice, setNotice] = useState<{
    tone: 'info' | 'error' | 'success';
    message: string;
  }>();

  const isConfigured = deployment !== null;
  const wrongNetwork =
    walletChainId !== undefined && walletChainId !== TARGET_CHAIN_ID;
  const isBusy = phase !== 'idle';
  const isStressed = market ? market.ratioE18 < market.triggerE18 : false;

  const refreshMarket = useCallback(async () => {
    if (!deployment) return;
    const [
      badToken,
      goodToken,
      badFeed,
      goodFeed,
      maxStaleness,
      triggerE18,
      discountBps,
      commitment,
      orderHash,
    ] = await Promise.all([
      publicClient.readContract({
        address: deployment.guard,
        abi: guardAbi,
        functionName: 'BAD_TOKEN',
      }),
      publicClient.readContract({
        address: deployment.guard,
        abi: guardAbi,
        functionName: 'GOOD_TOKEN',
      }),
      publicClient.readContract({
        address: deployment.guard,
        abi: guardAbi,
        functionName: 'BAD_USD_FEED',
      }),
      publicClient.readContract({
        address: deployment.guard,
        abi: guardAbi,
        functionName: 'GOOD_USD_FEED',
      }),
      publicClient.readContract({
        address: deployment.guard,
        abi: guardAbi,
        functionName: 'MAX_STALENESS',
      }),
      publicClient.readContract({
        address: deployment.guard,
        abi: guardAbi,
        functionName: 'TRIGGER_RATIO_E18',
      }),
      publicClient.readContract({
        address: deployment.guard,
        abi: guardAbi,
        functionName: 'UNWIND_DISCOUNT_BPS',
      }),
      publicClient.readContract({
        address: deployment.guard,
        abi: guardAbi,
        functionName: 'currentOracleCommitment',
      }),
      publicClient.readContract({
        address: deployment.router,
        abi: routerAbi,
        functionName: 'hash',
        args: [deployment.order],
      }),
    ]);

    if (
      badToken.toLowerCase() !== deployment.badToken.toLowerCase() ||
      goodToken.toLowerCase() !== deployment.goodToken.toLowerCase() ||
      badFeed.toLowerCase() !== deployment.badFeed.toLowerCase() ||
      goodFeed.toLowerCase() !== deployment.goodFeed.toLowerCase() ||
      orderHash.toLowerCase() !== deployment.orderHash.toLowerCase()
    ) {
      throw new Error(
        'The deployed market does not match its public manifest.',
      );
    }

    const [
      badSymbol,
      goodSymbol,
      badDecimals,
      goodDecimals,
      badFeedDecimals,
      goodFeedDecimals,
      badRound,
      goodRound,
      badBalance,
      goodBalance,
    ] = await Promise.all([
      publicClient.readContract({
        address: badToken,
        abi: erc20Abi,
        functionName: 'symbol',
      }),
      publicClient.readContract({
        address: goodToken,
        abi: erc20Abi,
        functionName: 'symbol',
      }),
      publicClient.readContract({
        address: badToken,
        abi: erc20Abi,
        functionName: 'decimals',
      }),
      publicClient.readContract({
        address: goodToken,
        abi: erc20Abi,
        functionName: 'decimals',
      }),
      publicClient.readContract({
        address: badFeed,
        abi: feedAbi,
        functionName: 'decimals',
      }),
      publicClient.readContract({
        address: goodFeed,
        abi: feedAbi,
        functionName: 'decimals',
      }),
      publicClient.readContract({
        address: badFeed,
        abi: feedAbi,
        functionName: 'latestRoundData',
      }),
      publicClient.readContract({
        address: goodFeed,
        abi: feedAbi,
        functionName: 'latestRoundData',
      }),
      publicClient.readContract({
        address: deployment.aqua,
        abi: aquaAbi,
        functionName: 'rawBalances',
        args: [
          deployment.order.maker,
          deployment.router,
          deployment.orderHash,
          badToken,
        ],
      }),
      publicClient.readContract({
        address: deployment.aqua,
        abi: aquaAbi,
        functionName: 'rawBalances',
        args: [
          deployment.order.maker,
          deployment.router,
          deployment.orderHash,
          goodToken,
        ],
      }),
    ]);

    const badPriceE18 = scaleFeedAnswer(badRound[1], badFeedDecimals);
    const goodPriceE18 = scaleFeedAnswer(goodRound[1], goodFeedDecimals);
    const next: MarketSnapshot = {
      badSymbol,
      goodSymbol,
      badDecimals,
      goodDecimals,
      badPriceE18,
      goodPriceE18,
      ratioE18: (badPriceE18 * 10n ** 18n) / goodPriceE18,
      triggerE18,
      discountBps,
      maxStaleness,
      oldestUpdate: Number(
        badRound[3] < goodRound[3] ? badRound[3] : goodRound[3],
      ),
      commitment,
      orderHash,
      badLiquidity: badBalance[0],
      goodLiquidity: goodBalance[0],
    };
    if (quote && quote.commitment !== next.commitment) {
      setQuote(undefined);
      setNotice({
        tone: 'info',
        message: 'The oracle advanced, so the previous quote was cleared.',
      });
    }
    setMarket(next);
  }, [quote]);

  const refreshUser = useCallback(async (wallet: Address) => {
    if (!deployment) return;
    const [goodBalance, badBalance, allowance] = await Promise.all([
      publicClient.readContract({
        address: deployment.goodToken,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [wallet],
      }),
      publicClient.readContract({
        address: deployment.badToken,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [wallet],
      }),
      publicClient.readContract({
        address: deployment.goodToken,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [wallet, deployment.router],
      }),
    ]);
    setUser({ goodBalance, badBalance, allowance });
  }, []);

  useEffect(() => {
    const savedSwap = readPendingSwap();
    if (!savedSwap) return;
    // oxlint-disable-next-line react/react-compiler -- recover a submitted transaction from browser storage after hydration
    setPendingSwap(savedSwap);
    setNotice({
      tone: 'info',
      message:
        'A previously submitted swap is awaiting a receipt check. New swaps stay locked until it resolves.',
    });
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- hydrate from the external RPC after mount
    void refreshMarket().catch((error) =>
      setNotice({ tone: 'error', message: describeError(error) }),
    );
    const interval = window.setInterval(
      () => void refreshMarket().catch(() => undefined),
      30_000,
    );
    return () => window.clearInterval(interval);
  }, [refreshMarket]);

  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- refresh external wallet state after account/round changes
    if (account && deployment) void refreshUser(account).catch(() => undefined);
  }, [account, market?.commitment, refreshUser]);

  useEffect(() => {
    const ethereum = getEthereum();
    if (!ethereum?.request) return;
    void Promise.all([
      ethereum.request({ method: 'eth_accounts' }),
      ethereum.request({ method: 'eth_chainId' }),
    ]).then(([accounts, chainId]) => {
      const knownAccounts = accounts as Address[];
      if (knownAccounts[0]) setAccount(knownAccounts[0]);
      setWalletChainId(Number(chainId));
    });
    const handleAccounts = (...args: unknown[]) => {
      const accounts = (args[0] ?? []) as Address[];
      setAccount(accounts[0]);
      setQuote(undefined);
      setReceipt(undefined);
    };
    const handleChain = (...args: unknown[]) => {
      setWalletChainId(Number(args[0]));
      setQuote(undefined);
    };
    ethereum.on?.('accountsChanged', handleAccounts);
    ethereum.on?.('chainChanged', handleChain);
    return () => {
      ethereum.removeListener?.('accountsChanged', handleAccounts);
      ethereum.removeListener?.('chainChanged', handleChain);
    };
  }, []);

  useEffect(() => {
    const context = (
      document as Document & { readonly modelContext?: ModelContext }
    ).modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: 'stage_breakwater_unwind',
          title: 'Stage treasury unwind',
          description:
            'Set the visible GOOD-token input amount for a Breakwater unwind. This only stages the ticket; it does not connect a wallet, approve tokens, or submit a transaction.',
          inputSchema: {
            type: 'object',
            properties: {
              amount: {
                type: 'string',
                pattern: '^(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$',
                description:
                  'Positive decimal token amount to place in You pay.',
              },
            },
            required: ['amount'],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            untrustedContentHint: false,
          },
          async execute(input) {
            if (
              !input ||
              typeof input !== 'object' ||
              !('amount' in input) ||
              typeof input.amount !== 'string' ||
              !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(input.amount) ||
              Number(input.amount) <= 0
            ) {
              throw new TypeError('amount must be a positive decimal string');
            }
            setAmount(input.amount);
            setQuote(undefined);
            setReceipt(undefined);
            return {
              status: 'staged',
              amount: input.amount,
              tokenIn: market?.goodSymbol ?? 'GOOD',
              nextAction: isConfigured
                ? 'connect-or-quote'
                : 'await-deployment',
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [isConfigured, market?.goodSymbol]);

  const getWallet = useCallback(() => {
    const ethereum = getEthereum();
    if (!ethereum)
      throw new Error(
        'No browser wallet was found. Install or enable an EVM wallet.',
      );
    return createWalletClient({ chain: sepolia, transport: custom(ethereum) });
  }, []);

  const connect = useCallback(async () => {
    try {
      setPhase('connecting');
      setNotice(undefined);
      const wallet = getWallet();
      const [nextAccount] = await wallet.requestAddresses();
      setAccount(nextAccount);
      setWalletChainId(await wallet.getChainId());
    } catch (error) {
      setNotice({ tone: 'error', message: describeError(error) });
    } finally {
      setPhase('idle');
    }
  }, [getWallet]);

  const switchNetwork = useCallback(async () => {
    try {
      setPhase('switching');
      setNotice(undefined);
      await getWallet().switchChain({ id: TARGET_CHAIN_ID });
      setWalletChainId(TARGET_CHAIN_ID);
    } catch (error) {
      setNotice({ tone: 'error', message: describeError(error) });
    } finally {
      setPhase('idle');
    }
  }, [getWallet]);

  const parsedAmount = useMemo(() => {
    if (!market) return 0n;
    try {
      return parseUnits(amount || '0', market.goodDecimals);
    } catch {
      return 0n;
    }
  }, [amount, market]);

  const exceedsDemoLimit = market
    ? parsedAmount > parseUnits('1000', market.goodDecimals)
    : false;

  const getQuote = useCallback(async () => {
    if (
      !deployment ||
      !market ||
      !account ||
      parsedAmount <= 0n ||
      exceedsDemoLimit
    )
      return;
    try {
      setPhase('quoting');
      setNotice(undefined);
      setReceipt(undefined);
      const commitment = await publicClient.readContract({
        address: deployment.guard,
        abi: guardAbi,
        functionName: 'currentOracleCommitment',
      });
      const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
      const deadline = latestBlock.timestamp + BigInt(QUOTE_LIFETIME_SECONDS);
      const discoveryTraits = buildTakerTraits(commitment, 1n, deadline);
      const discovery = await publicClient.simulateContract({
        account,
        address: deployment.router,
        abi: routerAbi,
        functionName: 'quote',
        args: [
          deployment.order,
          deployment.goodToken,
          deployment.badToken,
          parsedAmount,
          discoveryTraits,
        ],
      });
      const minimumOut = (discovery.result[1] * (BPS - SLIPPAGE_BPS)) / BPS;
      const traits = buildTakerTraits(commitment, minimumOut, deadline);
      const finalQuote = await publicClient.simulateContract({
        account,
        address: deployment.router,
        abi: routerAbi,
        functionName: 'quote',
        args: [
          deployment.order,
          deployment.goodToken,
          deployment.badToken,
          parsedAmount,
          traits,
        ],
      });
      setQuote({
        amountIn: finalQuote.result[0],
        amountOut: finalQuote.result[1],
        minimumOut,
        deadline,
        commitment,
        traits,
      });
      setNotice({
        tone: 'success',
        message: 'Quote bound to the current oracle round for 10 minutes.',
      });
    } catch (error) {
      setQuote(undefined);
      setNotice({ tone: 'error', message: describeError(error) });
    } finally {
      setPhase('idle');
    }
  }, [account, exceedsDemoLimit, market, parsedAmount]);

  const claimDemoTokens = useCallback(async () => {
    if (!deployment || !market || !account) return;
    try {
      setPhase('claiming');
      setNotice(undefined);
      const simulation = await publicClient.simulateContract({
        account,
        address: deployment.goodToken,
        abi: erc20Abi,
        functionName: 'claim',
      });
      const hash = await getWallet().writeContract(simulation.request);
      await waitForSuccessfulReceipt(hash);
      await refreshUser(account);
      setNotice({
        tone: 'success',
        message: `1,000 demo ${market.goodSymbol} claimed by this wallet.`,
      });
    } catch (error) {
      setNotice({ tone: 'error', message: describeError(error) });
    } finally {
      setPhase('idle');
    }
  }, [account, getWallet, market, refreshUser]);

  const approve = useCallback(async () => {
    if (!deployment || !account || !quote) return;
    try {
      setPhase('approving');
      setNotice(undefined);
      const simulation = await publicClient.simulateContract({
        account,
        address: deployment.goodToken,
        abi: erc20Abi,
        functionName: 'approve',
        args: [deployment.router, quote.amountIn],
      });
      const hash = await getWallet().writeContract(simulation.request);
      await waitForSuccessfulReceipt(hash);
      await refreshUser(account);
      setNotice({
        tone: 'success',
        message: 'Allowance confirmed. The swap is ready to sign.',
      });
    } catch (error) {
      setNotice({ tone: 'error', message: describeError(error) });
    } finally {
      setPhase('idle');
    }
  }, [account, getWallet, quote, refreshUser]);

  const settlePendingSwap = useCallback(
    async (submitted: PendingSwap) => {
      try {
        const transactionReceipt = await waitForSuccessfulReceipt(
          submitted.hash,
        );
        const swapEvent = parseEventLogs({
          abi: routerAbi,
          eventName: 'Swapped',
          logs: transactionReceipt.logs,
          strict: true,
        }).find(
          (event) =>
            event.address.toLowerCase() === deployment?.router.toLowerCase() &&
            event.args.orderHash.toLowerCase() ===
              submitted.orderHash.toLowerCase() &&
            event.args.maker.toLowerCase() ===
              deployment?.order.maker.toLowerCase() &&
            event.args.taker.toLowerCase() ===
              submitted.account.toLowerCase() &&
            event.args.tokenIn.toLowerCase() ===
              deployment?.goodToken.toLowerCase() &&
            event.args.tokenOut.toLowerCase() ===
              deployment?.badToken.toLowerCase(),
        );
        if (!swapEvent) {
          throw new Error(
            'The mined receipt did not contain the expected Breakwater swap event.',
          );
        }

        setReceipt({
          hash: transactionReceipt.transactionHash,
          amountIn: swapEvent.args.amountIn,
          amountOut: swapEvent.args.amountOut,
          impairedExposureRemoved: swapEvent.args.amountOut,
        });
        setPendingSwap(undefined);
        forgetPendingSwap();
        await Promise.allSettled([
          refreshMarket(),
          ...(account?.toLowerCase() === submitted.account.toLowerCase()
            ? [refreshUser(account)]
            : []),
        ]);
        setNotice({
          tone: 'success',
          message:
            'Swap settled. The receipt proves the treasury released impaired exposure.',
        });
      } catch (error) {
        if (
          error instanceof Error &&
          /cancelled|replaced with a different action|reverted after it was mined/i.test(
            error.message,
          )
        ) {
          setPendingSwap(undefined);
          forgetPendingSwap();
        }
        throw error;
      }
    },
    [account, refreshMarket, refreshUser],
  );

  const swap = useCallback(async () => {
    if (!deployment || !market || !account || !quote) return;
    let submitted: PendingSwap | undefined;
    try {
      setPhase('swapping');
      setNotice(undefined);
      const [currentCommitment, latestBlock] = await Promise.all([
        publicClient.readContract({
          address: deployment.guard,
          abi: guardAbi,
          functionName: 'currentOracleCommitment',
        }),
        publicClient.getBlock({ blockTag: 'latest' }),
      ]);
      if (currentCommitment !== quote.commitment) {
        setQuote(undefined);
        throw new Error('OracleCommitmentMismatch');
      }
      if (latestBlock.timestamp > quote.deadline) {
        setQuote(undefined);
        throw new Error('Quote deadline expired');
      }
      const simulation = await publicClient.simulateContract({
        account,
        address: deployment.router,
        abi: routerAbi,
        functionName: 'swap',
        args: [
          deployment.order,
          deployment.goodToken,
          deployment.badToken,
          quote.amountIn,
          quote.traits,
        ],
      });
      const hash = await getWallet().writeContract(simulation.request);
      submitted = {
        hash,
        account,
        orderHash: deployment.orderHash,
      };
      setPendingSwap(submitted);
      rememberPendingSwap(submitted);
      setQuote(undefined);
      setNotice({
        tone: 'info',
        message:
          'Swap submitted. New swaps stay locked while Sepolia confirms it.',
      });
      await settlePendingSwap(submitted);
    } catch (error) {
      const terminalSubmissionError =
        error instanceof Error &&
        /cancelled|replaced with a different action|reverted after it was mined/i.test(
          error.message,
        );
      if (!submitted) {
        const rejectedInWallet =
          error instanceof Error &&
          /user rejected|rejected the request|denied transaction/i.test(
            error.message,
          );
        if (!rejectedInWallet) setQuote(undefined);
      }
      setNotice({
        tone: submitted && !terminalSubmissionError ? 'info' : 'error',
        message:
          submitted && !terminalSubmissionError
            ? 'The swap was submitted, but finality is not confirmed yet. Re-check its receipt before starting another.'
            : describeError(error),
      });
    } finally {
      setPhase('idle');
    }
  }, [account, getWallet, market, quote, settlePendingSwap]);

  const resumePendingSwap = useCallback(async () => {
    if (!pendingSwap) return;
    try {
      setPhase('swapping');
      setNotice({
        tone: 'info',
        message: 'Checking the submitted swap on Sepolia…',
      });
      await settlePendingSwap(pendingSwap);
    } catch (error) {
      const terminalSubmissionError =
        error instanceof Error &&
        /cancelled|replaced with a different action|reverted after it was mined/i.test(
          error.message,
        );
      setNotice({
        tone: terminalSubmissionError ? 'error' : 'info',
        message: terminalSubmissionError
          ? describeError(error)
          : 'Finality is still unavailable. The submitted transaction remains locked for another receipt check.',
      });
    } finally {
      setPhase('idle');
    }
  }, [pendingSwap, settlePendingSwap]);

  const needsTokens =
    !!market &&
    !!user &&
    parsedAmount > 0n &&
    !exceedsDemoLimit &&
    user.goodBalance < parsedAmount;
  const needsApproval =
    !!quote && !!user && user.allowance < quote.amountIn && !needsTokens;

  const primaryAction = useMemo(() => {
    if (!isConfigured)
      return {
        label: 'Position not deployed',
        action: () => undefined,
        disabled: true,
      };
    if (pendingSwap)
      return {
        label: 'Check submitted swap',
        action: resumePendingSwap,
        disabled: false,
      };
    if (!account)
      return { label: 'Connect wallet', action: connect, disabled: false };
    if (wrongNetwork)
      return {
        label: `Switch to ${TARGET_NETWORK}`,
        action: switchNetwork,
        disabled: false,
      };
    if (exceedsDemoLimit)
      return {
        label: 'Reduce amount to 1,000 or less',
        action: () => undefined,
        disabled: true,
      };
    if (needsTokens)
      return {
        label: `Claim demo ${market?.goodSymbol ?? 'tokens'}`,
        action: claimDemoTokens,
        disabled: false,
      };
    if (!quote || quote.amountIn !== parsedAmount) {
      return {
        label: 'Get fresh quote',
        action: getQuote,
        disabled: parsedAmount <= 0n || !market,
      };
    }
    if (needsApproval)
      return {
        label: `Approve ${market?.goodSymbol ?? 'token'}`,
        action: approve,
        disabled: false,
      };
    return {
      label: `Swap ${market?.goodSymbol ?? ''} for ${market?.badSymbol ?? ''}`,
      action: swap,
      disabled: false,
    };
  }, [
    account,
    approve,
    connect,
    getQuote,
    isConfigured,
    market,
    claimDemoTokens,
    exceedsDemoLimit,
    needsApproval,
    needsTokens,
    pendingSwap,
    parsedAmount,
    quote,
    resumePendingSwap,
    swap,
    switchNetwork,
    wrongNetwork,
  ]);

  const phaseLabel: Record<Exclude<AsyncPhase, 'idle'>, string> = {
    connecting: 'Connecting wallet…',
    switching: 'Switching network…',
    claiming: 'Claiming demo tokens…',
    quoting: 'Reading the guard…',
    approving: 'Confirming allowance…',
    swapping: 'Settling through Aqua…',
  };
  const stateTitle = !isConfigured
    ? 'Market commissioning'
    : !market
      ? 'Reading guard state'
      : isStressed
        ? 'Stressed — unwind only'
        : 'Healthy — two-way pricing open';

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to trade
      </a>
      <header className="topbar">
        <a
          className="wordmark"
          href="#main-content"
          aria-label="Breakwater home"
        >
          <span className="wordmark-mark" aria-hidden="true">
            <Waves strokeWidth={2.2} />
          </span>
          <span>Breakwater</span>
        </a>
        <div className="topbar-actions">
          <span className="network-chip">
            <span
              className={isConfigured ? 'status-dot' : 'status-dot pending'}
            />
            {TARGET_NETWORK} · demo market
          </span>
          {account ? (
            <span className="wallet-button connected" title={account}>
              <WalletCards aria-hidden="true" />
              {shortenHex(account)}
            </span>
          ) : (
            <button
              className="wallet-button"
              type="button"
              onClick={connect}
              disabled={phase === 'connecting'}
            >
              <WalletCards aria-hidden="true" />
              Connect wallet
            </button>
          )}
        </div>
      </header>

      <main id="main-content" className="main-content">
        <section className="state-intro" aria-labelledby="state-heading">
          <div>
            <p className="instrument-label">Guard state / position 01</p>
            <h1 id="state-heading">{stateTitle}</h1>
          </div>
          <p className="state-summary">
            {!isConfigured
              ? 'The taker console is ready; the Sepolia position and public manifest are the remaining commission step.'
              : isStressed
                ? `The treasury will not accept more ${market?.badSymbol}. Only ${market?.goodSymbol} in → ${market?.badSymbol} out remains open.`
                : 'Both directions follow the Aqua pegged curve while the observed ratio remains above the trigger.'}
          </p>
        </section>

        <div className="console-grid">
          <section
            className="position-panel"
            aria-labelledby="position-heading"
          >
            <div className="panel-heading">
              <div>
                <p className="instrument-label">Live position</p>
                <h2 id="position-heading">Treasury tide gate</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Refresh onchain position"
                disabled={!isConfigured || isBusy}
                onClick={() =>
                  void refreshMarket().catch((error) =>
                    setNotice({ tone: 'error', message: describeError(error) }),
                  )
                }
              >
                <RefreshCw aria-hidden="true" />
              </button>
            </div>

            <dl className="readings">
              <div>
                <dt>Observed ratio</dt>
                <dd>{formatRatio(market?.ratioE18)}</dd>
                <span>
                  {market
                    ? `${market.badSymbol} / ${market.goodSymbol}`
                    : 'awaiting market'}
                </span>
              </div>
              <div>
                <dt>Safety trigger</dt>
                <dd>{formatRatio(market?.triggerE18)}</dd>
                <span>guard boundary</span>
              </div>
              <div>
                <dt>Oracle age</dt>
                <dd>{market ? timeAgo(market.oldestUpdate) : '—'}</dd>
                <span>
                  {market
                    ? `limit ${Math.floor(market.maxStaleness / 86_400)}d`
                    : 'no feed read'}
                </span>
              </div>
            </dl>

            <figure
              className={`tide-gate ${isStressed ? 'is-stressed' : ''} ${!market ? 'is-pending' : ''}`}
            >
              <div className="reservoir bad-reservoir">
                <span className="asset-role">Impaired asset</span>
                <strong>{market?.badSymbol ?? 'BAD'}</strong>
                <span className="liquidity-reading">
                  {formatToken(market?.badLiquidity, market?.badDecimals)}{' '}
                  available
                </span>
              </div>
              <div
                className="gate-channel"
                aria-label="Permitted swap directions"
              >
                <div
                  className={`route route-toxic ${isStressed || !market ? 'closed' : ''}`}
                >
                  <span>BAD in</span>
                  <ArrowRight aria-hidden="true" />
                  <span className="route-state">
                    {isStressed || !market ? (
                      <X aria-hidden="true" />
                    ) : (
                      <Check aria-hidden="true" />
                    )}
                    {isStressed || !market ? 'closed' : 'open'}
                  </span>
                </div>
                <div
                  className={`gate-symbol ${isStressed ? 'closed' : 'open'}`}
                  aria-hidden="true"
                >
                  <span />
                  <ShieldCheck />
                  <span />
                </div>
                <div
                  className={`route route-unwind ${!market ? 'closed' : ''}`}
                >
                  <span>BAD out</span>
                  <ArrowLeft aria-hidden="true" />
                  <span className="route-state">
                    {market ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <X aria-hidden="true" />
                    )}
                    {market ? 'open' : 'offline'}
                  </span>
                </div>
              </div>
              <div className="reservoir good-reservoir">
                <span className="asset-role">Reserve asset</span>
                <strong>{market?.goodSymbol ?? 'GOOD'}</strong>
                <span className="liquidity-reading">
                  {formatToken(market?.goodLiquidity, market?.goodDecimals)}{' '}
                  available
                </span>
              </div>
              <figcaption>
                {isStressed
                  ? 'The guard skips the healthy pegged curve and prices only the exposure-reducing exit from its committed oracle round.'
                  : market
                    ? 'The guard continues into the official SwapVM pegged curve while the pair remains healthy.'
                    : 'Routes remain offline until the Sepolia deployment manifest is published.'}
              </figcaption>
            </figure>

            <div className="position-foot">
              <div>
                <span className="instrument-label">Oracle commitment</span>
                <code>
                  {market
                    ? shortenHex(market.commitment, 10, 8)
                    : 'Not available'}
                </code>
              </div>
              <div>
                <span className="instrument-label">Unwind discount</span>
                <code>{market ? `${market.discountBps / 100}%` : '—'}</code>
              </div>
              <div>
                <span className="instrument-label">Order hash</span>
                <code>
                  {market
                    ? shortenHex(market.orderHash, 10, 8)
                    : 'Not available'}
                </code>
              </div>
            </div>
          </section>

          <aside className="trade-ticket" aria-labelledby="ticket-heading">
            <div className="ticket-heading">
              <div>
                <p className="instrument-label">Exposure-reducing route</p>
                <h2 id="ticket-heading">Treasury unwind</h2>
              </div>
              <span className={`state-stamp ${isStressed ? 'stress' : ''}`}>
                {market ? (isStressed ? 'stressed' : 'healthy') : 'offline'}
              </span>
            </div>

            <div className="amount-field">
              <label htmlFor="pay-amount">You pay</label>
              <div className="amount-input-row">
                <input
                  id="pay-amount"
                  name="pay-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setQuote(undefined);
                    setReceipt(undefined);
                  }}
                  aria-describedby="amount-help"
                  aria-invalid={
                    !!market && (parsedAmount <= 0n || exceedsDemoLimit)
                  }
                />
                <strong>{market?.goodSymbol ?? 'GOOD'}</strong>
              </div>
              <span id="amount-help" className="field-meta">
                {market && parsedAmount <= 0n
                  ? 'Enter a positive amount.'
                  : exceedsDemoLimit
                    ? 'The public demo route is capped at 1,000 tokens per swap.'
                    : `Wallet ${formatToken(user?.goodBalance, market?.goodDecimals)} ${market?.goodSymbol ?? 'GOOD'}`}
              </span>
            </div>
            <div className="swap-divider" aria-hidden="true">
              <ArrowDown />
            </div>
            <div className="amount-field output-field">
              <span>You receive</span>
              <div className="amount-input-row">
                <output>
                  {quote
                    ? formatToken(quote.amountOut, market?.badDecimals, 4)
                    : '—'}
                </output>
                <strong>{market?.badSymbol ?? 'BAD'}</strong>
              </div>
              <span className="field-meta">
                Wallet {formatToken(user?.badBalance, market?.badDecimals)}{' '}
                {market?.badSymbol ?? 'BAD'}
              </span>
            </div>

            <dl className="quote-terms">
              <div>
                <dt>Minimum received</dt>
                <dd>
                  {quote
                    ? `${formatToken(quote.minimumOut, market?.badDecimals, 4)} ${market?.badSymbol}`
                    : 'Set after quote'}
                </dd>
              </div>
              <div>
                <dt>Quote protection</dt>
                <dd>0.50% + oracle lock</dd>
              </div>
              <div>
                <dt>Deadline</dt>
                <dd>
                  {quote
                    ? new Date(
                        Number(quote.deadline) * 1000,
                      ).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '10 minutes'}
                </dd>
              </div>
            </dl>

            <button
              className="primary-action"
              type="button"
              onClick={primaryAction.action}
              disabled={primaryAction.disabled || isBusy}
              aria-busy={isBusy}
              aria-describedby="primary-action-help"
            >
              {isBusy && <LoaderCircle className="spin" aria-hidden="true" />}
              {isBusy
                ? phaseLabel[phase as Exclude<AsyncPhase, 'idle'>]
                : primaryAction.label}
            </button>
            <p id="primary-action-help" className="action-help">
              {!isConfigured
                ? 'The action unlocks when the Sepolia manifest is published.'
                : pendingSwap
                  ? 'A transaction was already broadcast. Its receipt must resolve before another swap.'
                  : !account
                    ? 'Connect an EVM wallet to continue.'
                    : wrongNetwork
                      ? 'Breakwater executes this demo on Sepolia.'
                      : market && (parsedAmount <= 0n || exceedsDemoLimit)
                        ? 'Enter an amount from 0 to 1,000 before requesting a quote.'
                        : 'Your wallet shows every state-changing step before submission.'}
            </p>
            {account &&
              !wrongNetwork &&
              market &&
              !needsTokens &&
              !pendingSwap && (
                <button
                  className="text-action"
                  type="button"
                  onClick={claimDemoTokens}
                  disabled={isBusy}
                >
                  Need test assets? Claim 1,000 {market.goodSymbol}
                </button>
              )}
            {notice && (
              <output
                className={`notice ${notice.tone}`}
                aria-live="polite"
                aria-atomic="true"
              >
                {notice.tone === 'error' ? (
                  <CircleAlert aria-hidden="true" />
                ) : (
                  <Check aria-hidden="true" />
                )}
                <span>{notice.message}</span>
              </output>
            )}
            {pendingSwap && deployment && (
              <a
                className="text-action"
                href={`${deployment.explorerUrl}/tx/${pendingSwap.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View submitted transaction <ExternalLink aria-hidden="true" />
              </a>
            )}
            <details className="signing-details">
              <summary>What the wallet will sign</summary>
              <dl>
                <div>
                  <dt>Network</dt>
                  <dd>{TARGET_NETWORK}</dd>
                </div>
                <div>
                  <dt>Execution</dt>
                  <dd>1inch Aqua + SwapVM v1.0.2</dd>
                </div>
                <div>
                  <dt>Guard</dt>
                  <dd>
                    {deployment
                      ? shortenHex(deployment.guard)
                      : 'Awaiting deployment'}
                  </dd>
                </div>
                <div>
                  <dt>Oracle round</dt>
                  <dd>
                    {quote
                      ? shortenHex(quote.commitment)
                      : 'Bound at quote time'}
                  </dd>
                </div>
              </dl>
            </details>
          </aside>
        </div>

        {receipt && market && deployment && (
          <section className="receipt" aria-labelledby="receipt-heading">
            <div className="receipt-check" aria-hidden="true">
              <Check />
            </div>
            <div>
              <p className="instrument-label">Settlement complete</p>
              <h2 id="receipt-heading">
                {formatToken(receipt.amountIn, market.goodDecimals)}{' '}
                {market.goodSymbol} exchanged for{' '}
                {formatToken(receipt.amountOut, market.badDecimals, 4)}{' '}
                {market.badSymbol}
              </h2>
              <p>
                The mined SwapVM event proves this execution removed{' '}
                {formatToken(
                  receipt.impairedExposureRemoved,
                  market.badDecimals,
                  4,
                )}{' '}
                {market.badSymbol} from the Aqua position.
              </p>
            </div>
            <a
              href={`${deployment.explorerUrl}/tx/${receipt.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction <ExternalLink aria-hidden="true" />
            </a>
          </section>
        )}

        <section className="proof-strip" aria-label="Implementation proof">
          <div>
            <span className="instrument-label">Execution rail</span>
            <strong>Official Aqua + SwapVM v1.0.2</strong>
          </div>
          <div>
            <span className="instrument-label">Fail-closed controls</span>
            <strong>Oracle round · threshold · deadline</strong>
          </div>
          <div>
            <span className="instrument-label">Canonical proof</span>
            <a
              href="https://github.com/qdeeworld/breakwater/blob/main/evidence/mainnet-fork-2026-09-04.md"
              target="_blank"
              rel="noreferrer"
            >
              Read fork evidence <ExternalLink aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>Breakwater / ETHOnline 2026</span>
        <a
          href="https://github.com/qdeeworld/breakwater"
          target="_blank"
          rel="noreferrer"
        >
          Source code <ExternalLink aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
