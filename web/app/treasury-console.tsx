'use client';

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type SubmitEvent,
} from 'react';
import Link from 'next/link';
import { Waves } from 'lucide-react';
import {
  createWalletClient,
  custom,
  encodeAbiParameters,
  formatUnits,
  isAddress,
  isHex,
  parseAbiParameters,
  parseEventLogs,
  parseUnits,
  zeroAddress,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import { ensureAllocationAllowance } from '@/lib/allocation-approval';
import {
  buildTakerTraits,
  describeError,
  erc20Abi,
  routerAbi,
  shortenHex,
} from '@/lib/breakwater';
import {
  makerClient,
  makerDeployment as d,
  positionsAbi,
  policyAbi,
  scenarioAbi,
  shipAbi,
  readMakerPosition,
  readOwnedPositions,
  type MakerPosition,
} from '@/lib/maker';

type Provider = EIP1193Provider & {
  on?: (event: string, handler: (value: unknown) => void) => void;
  removeListener?: (event: string, handler: (value: unknown) => void) => void;
};
type Call = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
};
type TradeQuote = {
  hash: Hex;
  input: bigint;
  output: bigint;
  minimum: bigint;
  deadline: bigint;
  commitment: Hex;
  assetIn: boolean;
  traits: Hex;
};
const pendingKey = 'breakwater:maker-pending:v1';
const disconnectedKey = 'breakwater:maker-disconnected';
const provider = () =>
  typeof window === 'undefined'
    ? undefined
    : (window as Window & { ethereum?: Provider }).ethereum;
const tokens = (n: bigint | undefined) =>
  n === undefined
    ? '—'
    : Number(formatUnits(n, 6)).toLocaleString('en-US', {
        maximumFractionDigits: 6,
      });
const percent = (n: number) => `${(n / 100).toFixed(2)}%`;
const usd = (n: bigint | undefined) =>
  n === undefined ? '—' : `$${Number(formatUnits(n, 18)).toFixed(4)}`;
const message = (e: unknown) => describeError(e);

class SettledTransactionError extends Error {}
async function confirmed(hash: Hex, onReplacement?: (hash: Hex) => void) {
  let replaced = false;
  const receipt = await makerClient.waitForTransactionReceipt({
    hash,
    pollingInterval: 1000,
    timeout: 180000,
    onReplaced: (r) => {
      onReplacement?.(r.transaction.hash);
      if (r.reason !== 'repriced') replaced = true;
    },
  });
  if (replaced)
    throw new SettledTransactionError(
      'The wallet cancelled or replaced this action. Check its transaction before retrying.',
    );
  if (receipt.status !== 'success')
    throw new SettledTransactionError(
      'The transaction reverted. No changes from this transaction were kept.',
    );
  return receipt;
}

function CancelPositionDialog({
  disabled,
  onConfirm,
}: {
  disabled: boolean;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button disabled={disabled} onClick={() => dialog.current?.showModal()}>
        Cancel position…
      </button>
      <dialog
        ref={dialog}
        role="alertdialog"
        aria-labelledby="cancel-title"
        aria-describedby="cancel-description"
        className="maker-cancel-dialog"
      >
        <h3 id="cancel-title">Cancel this position?</h3>
        <p id="cancel-description">
          Both directions stop permanently for this order. Your wallet keeps the
          tokens. Aqua token approvals remain until you revoke them.
        </p>
        <div className="maker-actions">
          <button onClick={() => dialog.current?.close()}>
            Keep position open
          </button>
          <button
            disabled={disabled}
            onClick={() => {
              dialog.current?.close();
              onConfirm();
            }}
          >
            Confirm cancellation
          </button>
        </div>
      </dialog>
    </>
  );
}

export function TreasuryConsole() {
  const [asset, setAsset] = useState('100');
  const [reserve, setReserve] = useState('100');
  const [fee, setFee] = useState('30'),
    [trigger, setTrigger] = useState('98'),
    [discount, setDiscount] = useState('50');
  const [account, setAccount] = useState<Address>(),
    [chain, setChain] = useState<number>();
  const [owned, setOwned] = useState<Hex[]>([]),
    [selected, setSelected] = useState<Hex>();
  const [position, setPosition] = useState<MakerPosition>(),
    [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(''),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  const [readError, setReadError] = useState('');
  const [receiptHash, setReceiptHash] = useState<Hex>(),
    [showCreate, setShowCreate] = useState(true);
  const [pendingHash, setPendingHash] = useState<Hex>();
  const [settledRevision, setSettledRevision] = useState(0);
  const [tradeWallet, setTradeWallet] = useState<{
    account: Address;
    token: Address;
    balance: bigint;
    allowance: bigint;
  }>();
  const [fieldError, setFieldError] = useState(''),
    [amount, setAmount] = useState('10'),
    [assetIn, setAssetIn] = useState(true);
  const [quote, setQuote] = useState<TradeQuote>(),
    [quoteError, setQuoteError] = useState(''),
    [quoting, setQuoting] = useState(false);
  const [refreshQuote, setRefreshQuote] = useState(0),
    [now, setNow] = useState(0);
  const [lastTrade, setLastTrade] = useState<{
    input: bigint;
    output: bigint;
    assetIn: boolean;
  }>();
  const lock = useRef(false),
    readSequence = useRef(0),
    selectedRef = useRef<Hex | undefined>(undefined);
  const allocationRef = useRef<HTMLInputElement>(null);
  const tradeToken = d ? (assetIn ? d.badToken : d.goodToken) : undefined;
  const currentTradeWallet =
    tradeWallet?.account === account && tradeWallet?.token === tradeToken
      ? tradeWallet
      : undefined;

  useEffect(() => {
    let active = true;
    const deployment = d;
    if (account && tradeToken && deployment)
      void Promise.all([
        makerClient.readContract({
          address: tradeToken,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [account],
        }),
        makerClient.readContract({
          address: tradeToken,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [account, deployment.router],
        }),
      ])
        .then(([balance, allowance]) => {
          if (active)
            setTradeWallet({ account, token: tradeToken, balance, allowance });
        })
        .catch(() => {
          if (active) setTradeWallet(undefined);
        });
    return () => {
      active = false;
    };
  }, [account, tradeToken, settledRevision]);

  const choose = useCallback((hash: Hex) => {
    selectedRef.current = hash;
    setSelected(hash);
    setPosition(undefined);
    setQuote(undefined);
    setShowCreate(false);
    setError('');
    setReadError('');
    setLastTrade(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set('position', hash);
    window.history.replaceState(null, '', url);
  }, []);
  const refresh = useCallback(async () => {
    if (!selected || !d) return;
    const sequence = ++readSequence.current;
    setLoading(true);
    try {
      const p = await readMakerPosition(selected);
      if (
        sequence === readSequence.current &&
        selectedRef.current === selected
      ) {
        setPosition(p);
        setReadError('');
        if (p.observation.value?.[0] === false) setAssetIn(false);
      }
    } catch (e) {
      if (sequence === readSequence.current) {
        setPosition(undefined);
        setReadError(message(e));
      }
    } finally {
      if (sequence === readSequence.current) setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    const hash = new URL(window.location.href).searchParams.get('position');
    const initial = setTimeout(() => {
      if (hash && isHex(hash) && hash.length === 66) choose(hash);
    }, 0);
    const p = provider();
    if (!p) return () => clearTimeout(initial);
    const accounts = (value: unknown) => {
      if (sessionStorage.getItem(disconnectedKey) === 'yes') return;
      const address =
        Array.isArray(value) && isAddress(value[0])
          ? (value[0] as Address)
          : undefined;
      setAccount(address);
      setOwned([]);
      setQuote(undefined);
    };
    const network = (value: unknown) => {
      setChain(Number(value));
      setQuote(undefined);
    };
    if (sessionStorage.getItem(disconnectedKey) !== 'yes')
      void p
        .request({ method: 'eth_accounts' })
        .then(accounts)
        .catch(() => {});
    void p
      .request({ method: 'eth_chainId' })
      .then(network)
      .catch(() => {});
    p.on?.('accountsChanged', accounts);
    p.on?.('chainChanged', network);
    return () => {
      clearTimeout(initial);
      p.removeListener?.('accountsChanged', accounts);
      p.removeListener?.('chainChanged', network);
    };
  }, [choose]);
  useEffect(() => {
    let active = true;
    if (account && d)
      void readOwnedPositions(account)
        .then((hashes) => {
          if (active) setOwned(hashes);
        })
        .catch((e) => {
          if (active) setError(message(e));
        });
    return () => {
      active = false;
    };
  }, [account, settledRevision]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const refreshAfterRecovery = useEffectEvent(() => {
    void refresh();
  });

  // Resume receipt observation after a reload; never resend the transaction.
  useEffect(() => {
    let active = true;
    const initial = setTimeout(() => {
      try {
        const pending = JSON.parse(localStorage.getItem(pendingKey) || 'null');
        if (
          pending &&
          pending.chainId === sepolia.id &&
          isHex(pending.hash) &&
          pending.hash.length === 66
        ) {
          lock.current = true;
          setBusy('Confirming previous transaction');
          setReceiptHash(pending.hash);
          setPendingHash(pending.hash);
          void confirmed(pending.hash, (hash) => {
            if (active) {
              setPendingHash(hash);
              setReceiptHash(hash);
            }
            localStorage.setItem(
              pendingKey,
              JSON.stringify({ hash, chainId: sepolia.id }),
            );
          })
            .then((r) => {
              if (!active) return;
              const logs = parseEventLogs({
                abi: positionsAbi,
                logs: r.logs,
                eventName: 'PositionCreated',
              });
              const created = logs.find(
                (l) => l.address.toLowerCase() === d?.positions.toLowerCase(),
              );
              if (created) choose(created.args.orderHash);
              setStatus(
                'Previous transaction confirmed. Reloaded its onchain result.',
              );
              localStorage.removeItem(pendingKey);
              setPendingHash(undefined);
              setSettledRevision((v) => v + 1);
              refreshAfterRecovery();
            })
            .catch((e) => {
              if (e instanceof SettledTransactionError) {
                localStorage.removeItem(pendingKey);
                if (active) setPendingHash(undefined);
              }
              if (active)
                setError(`${message(e)} Check the receipt before retrying.`);
            })
            .finally(() => {
              if (active) {
                lock.current = false;
                setBusy('');
              }
            });
        }
      } catch {
        localStorage.removeItem(pendingKey);
      }
    }, 0);
    return () => {
      active = false;
      clearTimeout(initial);
    };
  }, [choose]);

  const run = async (label: string, action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError('');
    setStatus('');
    try {
      await action();
      await refresh();
    } catch (e) {
      if (e instanceof SettledTransactionError) {
        localStorage.removeItem(pendingKey);
        setPendingHash(undefined);
      }
      setError(message(e));
    } finally {
      lock.current = false;
      setBusy('');
    }
  };
  const wallet = async () => {
    const p = provider();
    if (!p)
      throw new Error(
        'Open this page in a wallet browser or install an Ethereum wallet.',
      );
    const addresses = await p.request({ method: 'eth_accounts' });
    if (!account || addresses[0]?.toLowerCase() !== account.toLowerCase())
      throw new Error(
        'The wallet account changed. Connect the intended account and retry.',
      );
    if (Number(await p.request({ method: 'eth_chainId' })) !== sepolia.id)
      throw new Error('Switch your wallet to Sepolia before signing.');
    return createWalletClient({
      chain: sepolia,
      account,
      transport: custom(p),
    });
  };
  const transact = async (call: Call) => {
    if (localStorage.getItem(pendingKey))
      throw new Error(
        'A previous transaction is still unresolved. Check its receipt before submitting another action.',
      );
    const w = await wallet();
    const { request } = await makerClient.simulateContract({
      ...call,
      account: w.account,
    });
    setStatus('Review this action in your wallet.');
    await wallet(); // Recheck account/network after the asynchronous simulation.
    const hash = await w.writeContract(request);
    setReceiptHash(hash);
    setPendingHash(hash);
    setStatus('Submitted. Waiting for a Sepolia confirmation…');
    localStorage.setItem(
      pendingKey,
      JSON.stringify({ hash, chainId: sepolia.id }),
    );
    const receipt = await confirmed(hash, (replacement) => {
      setReceiptHash(replacement);
      setPendingHash(replacement);
      localStorage.setItem(
        pendingKey,
        JSON.stringify({ hash: replacement, chainId: sepolia.id }),
      );
    });
    localStorage.removeItem(pendingKey);
    setPendingHash(undefined);
    setSettledRevision((v) => v + 1);
    setStatus('Transaction confirmed.');
    return receipt;
  };
  const connect = () =>
    run('Connecting wallet', async () => {
      const p = provider();
      if (!p)
        throw new Error(
          'Open this page in a wallet browser or install an Ethereum wallet.',
        );
      const addresses = await p.request({ method: 'eth_requestAccounts' });
      if (!addresses[0]) throw new Error('No wallet account was selected.');
      setAccount(addresses[0]);
      setChain(Number(await p.request({ method: 'eth_chainId' })));
      sessionStorage.removeItem(disconnectedKey);
    });
  const switchNetwork = () =>
    run('Switching network', async () => {
      const p = provider();
      if (!p) return;
      await p.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xaa36a7' }],
      });
      setChain(sepolia.id);
    });
  const disconnect = () => {
    setAccount(undefined);
    setOwned([]);
    sessionStorage.setItem(disconnectedKey, 'yes');
    setStatus(
      'Disconnected from this app. Existing Aqua permissions are unchanged.',
    );
  };

  const create = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldError('');
    if (!account) {
      void connect();
      return;
    }
    if (chain !== sepolia.id) {
      void switchNetwork();
      return;
    }
    let a: bigint, r: bigint;
    try {
      a = parseUnits(asset, 6);
      r = parseUnits(reserve, 6);
      if (
        !/^\d+(\.\d{1,6})?$/.test(asset) ||
        !/^\d+(\.\d{1,6})?$/.test(reserve) ||
        a <= 0n ||
        r <= 0n
      )
        throw new Error();
    } catch {
      setFieldError(
        'Enter positive allocations with at most six decimal places.',
      );
      allocationRef.current?.focus();
      return;
    }
    void run('Creating position', async () => {
      if (!d)
        throw new Error(
          'Owner contracts are not configured in this preview yet.',
        );
      const receipt = await transact({
        address: d.positions,
        abi: positionsAbi,
        functionName: 'createDemo',
        args: [
          {
            assetAllocation: a,
            reserveAllocation: r,
            feeBps: Number(fee),
            trigger: BigInt(trigger) * 10n ** 16n,
            discountBps: Number(discount),
            assetMaxAge: 86400,
            reserveMaxAge: 90000,
          },
        ],
      });
      const logs = parseEventLogs({
        abi: positionsAbi,
        logs: receipt.logs,
        eventName: 'PositionCreated',
      });
      const log = logs.find(
        (l) => l.address.toLowerCase() === d?.positions.toLowerCase(),
      );
      if (!log)
        throw new Error(
          'Creation receipt has no matching position. Inspect the receipt before retrying.',
        );
      choose(log.args.orderHash);
      setOwned(await readOwnedPositions(account));
      setStatus(
        'Position created. Approve the two allocations, then ship to Aqua.',
      );
    });
  };
  const approveAllocation = (assetSide: boolean) =>
    run('Approving Aqua allocation', async () => {
      if (!d || !position) return;
      const value = assetSide
        ? position.shipped
          ? position.assetBalance
          : position.assetAllocation
        : position.shipped
          ? position.reserveBalance
          : position.reserveAllocation;
      const token = assetSide ? d.badToken : d.goodToken;
      const aqua = d.aqua;
      const w = await wallet();
      const changed = await ensureAllocationAllowance(
        value,
        () =>
          makerClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [w.account.address, aqua],
          }),
        (approval) =>
          transact({
            address: token,
            abi: erc20Abi,
            functionName: 'approve',
            args: [aqua, approval],
          }),
      );
      if (!changed)
        setStatus(
          'Existing Aqua allowance already covers this allocation. It was left unchanged.',
        );
    });
  const ship = () =>
    run('Shipping position to Aqua', async () => {
      if (!d || !position) return;
      const current = await readMakerPosition(position.hash);
      if (
        current.assetWallet < current.assetAllocation ||
        current.reserveWallet < current.reserveAllocation
      )
        throw new Error(
          'Your wallet needs enough of both sample tokens to back this allocation.',
        );
      const strategy = encodeAbiParameters(
        parseAbiParameters('(address maker,uint256 traits,bytes data)'),
        [current.order],
      );
      await transact({
        address: d.aqua,
        abi: shipAbi,
        functionName: 'ship',
        args: [
          d.router,
          strategy,
          [d.badToken, d.goodToken],
          [current.assetAllocation, current.reserveAllocation],
        ],
      });
      setStatus(
        'Position shipped. Other wallets can now trade within its policy.',
      );
    });
  const cancel = () =>
    run('Cancelling Aqua allocation', async () => {
      if (!d || !position) return;
      await transact({
        address: d.aqua,
        abi: shipAbi,
        functionName: 'dock',
        args: [d.router, position.hash, [d.badToken, d.goodToken]],
      });
      setStatus(
        'Position cancelled. Tokens remain in your wallet. Aqua token approvals remain until you revoke them.',
      );
    });

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const initial = setTimeout(() => {
      setQuote(undefined);
      setQuoteError('');
      setQuoting(false);
      const p = position;
      const deployment = d;
      if (!p?.shipped || !p.observation.value || !deployment) return;
      if (!p.observation.value[0] && assetIn) {
        setQuoteError('Refused: this direction would add impaired inventory.');
        return;
      }
      let input: bigint;
      try {
        input = parseUnits(amount, 6);
        if (!/^\d+(\.\d{1,6})?$/.test(amount) || input <= 0n) throw new Error();
      } catch {
        setQuoteError(
          'Enter a positive trade amount with at most six decimals.',
        );
        return;
      }
      timer = setTimeout(() => {
        setQuoting(true);
        const commitment = p.observation.value![3],
          deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
        void makerClient
          .simulateContract({
            address: deployment.router,
            abi: [...routerAbi, ...policyAbi],
            functionName: 'quote',
            args: [
              p.order,
              assetIn ? deployment.badToken : deployment.goodToken,
              assetIn ? deployment.goodToken : deployment.badToken,
              input,
              buildTakerTraits(commitment, 1n, deadline),
            ],
          })
          .then(({ result }) => {
            if (!active) return;
            const available = assetIn ? p.reserveAvailable : p.assetAvailable;
            if (result[1] > available)
              throw new Error(
                'Exit unavailable at this size: the owner’s wallet balance or Aqua allowance does not back the required output.',
              );
            const minimum = (result[1] * 9950n) / 10000n;
            if (minimum <= 0n)
              throw new Error('Amount is too small for a protected quote.');
            setQuote({
              hash: p.hash,
              input,
              output: result[1],
              minimum,
              deadline,
              commitment,
              assetIn,
              traits: buildTakerTraits(commitment, minimum, deadline),
            });
          })
          .catch((e) => {
            if (active)
              setQuoteError(
                `Quote unavailable. ${message(e)} Try a smaller amount or refresh the position.`,
              );
          })
          .finally(() => {
            if (active) setQuoting(false);
          });
      }, 400);
    }, 0);
    return () => {
      active = false;
      clearTimeout(initial);
      clearTimeout(timer);
    };
  }, [position, amount, assetIn, refreshQuote]);
  const trade = () =>
    run('Preparing trade', async () => {
      if (!d || !position || !quote)
        throw new Error('Wait for an available quote.');
      if (
        quote.hash !== position.hash ||
        quote.assetIn !== assetIn ||
        quote.input !== parseUnits(amount, 6) ||
        BigInt(Math.floor(Date.now() / 1000)) >= quote.deadline
      )
        throw new Error('Quote changed or expired. Refresh it before signing.');
      const token = assetIn ? d.badToken : d.goodToken;
      const w = await wallet();
      const allowance = await makerClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [w.account.address, d.router],
      });
      if (allowance < quote.input) {
        await transact({
          address: token,
          abi: erc20Abi,
          functionName: 'approve',
          args: [d.router, quote.input],
        });
        setStatus(
          'Trade amount approved. Review the refreshed quote, then swap.',
        );
        setRefreshQuote((v) => v + 1);
        return;
      }
      const receipt = await transact({
        address: d.router,
        abi: [...routerAbi, ...policyAbi],
        functionName: 'swap',
        args: [
          position.order,
          token,
          assetIn ? d.goodToken : d.badToken,
          quote.input,
          quote.traits,
        ],
      });
      const log = parseEventLogs({
        abi: routerAbi,
        logs: receipt.logs,
        eventName: 'Swapped',
      }).find(
        (l) =>
          l.address.toLowerCase() === d?.router.toLowerCase() &&
          l.args.orderHash === position.hash,
      );
      if (log)
        setLastTrade({
          input: log.args.amountIn,
          output: log.args.amountOut,
          assetIn,
        });
      setQuote(undefined);
      setStatus(
        'Swap settled. Position inventory and earned fees are updated from the chain.',
      );
    });

  const isOwner =
    !!account && position?.owner.toLowerCase() === account.toLowerCase();
  const ready = !!account && chain === sepolia.id && !busy && !pendingHash;
  const state = position
    ? position.cancelled
      ? 'Cancelled'
      : !position.shipped
        ? 'Draft'
        : !position.observation.value
          ? 'Halted'
          : position.observation.value[0]
            ? 'Healthy'
            : 'Stressed'
    : 'Loading';
  const observation = position?.observation.value;
  const age = (
    round: readonly [bigint, bigint, bigint, bigint, bigint] | undefined,
  ) => (round ? `${Math.max(0, now - Number(round[3]))}s ago` : 'Unavailable');
  return (
    <div className="site-shell maker-shell">
      <a className="skip-link" href="#treasury">
        Skip to treasury
      </a>
      <header className="topbar">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">
            <Waves aria-hidden="true" />
          </span>
          Breakwater
        </Link>
        <div className="topbar-actions">
          <span className="network-chip">Sepolia · no-value test tokens</span>
          {account ? (
            <>
              <span className="maker-address">{shortenHex(account)}</span>
              <button
                className="wallet-button"
                disabled={!!busy}
                onClick={disconnect}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              className="wallet-button"
              disabled={!!busy}
              onClick={() => void connect()}
            >
              Connect wallet
            </button>
          )}
        </div>
      </header>
      <main className="main-content" id="treasury">
        <section className="state-intro">
          <div>
            <p className="instrument-label">Your treasury, your limits</p>
            <h1>Put liquidity to work.</h1>
            <p className="state-summary">
              Earn trading fees while healthy. Stop taking on an impaired asset
              when your policy trips.
            </p>
          </div>
        </section>
        <output className="maker-status">
          {busy ? `${busy}… ` : ''}
          {status}
        </output>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {receiptHash && (
          <p className="maker-receipt-link">
            <a
              href={`https://sepolia.etherscan.io/tx/${receiptHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View latest transaction ↗
            </a>
          </p>
        )}
        {!showCreate && readError && (
          <p className="notice error" role="alert">
            {readError}
          </p>
        )}
        {pendingHash && !busy && (
          <p className="notice">
            Confirmation is unresolved. No new transaction will be sent until
            this is resolved.{' '}
            <button
              className="text-action"
              onClick={() =>
                void run('Checking pending transaction', async () => {
                  const r = await confirmed(pendingHash, (replacement) => {
                    setPendingHash(replacement);
                    setReceiptHash(replacement);
                    localStorage.setItem(
                      pendingKey,
                      JSON.stringify({
                        hash: replacement,
                        chainId: sepolia.id,
                      }),
                    );
                  });
                  localStorage.removeItem(pendingKey);
                  setPendingHash(undefined);
                  setSettledRevision((v) => v + 1);
                  const created = parseEventLogs({
                    abi: positionsAbi,
                    logs: r.logs,
                    eventName: 'PositionCreated',
                  }).find(
                    (l) =>
                      l.address.toLowerCase() === d?.positions.toLowerCase(),
                  );
                  if (created) choose(created.args.orderHash);
                  setStatus('Transaction confirmed.');
                })
              }
            >
              Check pending transaction
            </button>
          </p>
        )}
        {account && chain !== sepolia.id && (
          <p className="notice">
            Wallet is on another network.{' '}
            <button
              className="text-action"
              disabled={!!busy}
              onClick={() => void switchNetwork()}
            >
              Switch to Sepolia
            </button>
          </p>
        )}
        {!d && (
          <p className="notice">
            Local build preview: owner contracts are not configured yet. No
            position can be created here until deployment is connected.
          </p>
        )}
        <nav className="maker-nav" aria-label="Treasury actions">
          <Link className="text-action" href="/positions">
            Find liquidity
          </Link>
          <button className="text-action" onClick={() => setShowCreate(true)}>
            Create position
          </button>
          {owned.length > 0 && (
            <label>
              My positions (latest 20)
              <select
                aria-label="Select my position"
                value={owned.includes(selected as Hex) ? selected : ''}
                onChange={(e) => choose(e.target.value as Hex)}
              >
                <option value="" disabled>
                  Choose a position
                </option>
                {owned.map((hash, i) => (
                  <option key={hash} value={hash}>
                    {i === 0 ? 'Latest · ' : ''}
                    {shortenHex(hash)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selected && (
            <button
              className="text-action"
              onClick={() => setShowCreate(false)}
            >
              Selected position
            </button>
          )}
          <Link className="text-action" href="/trade">
            Existing public trade
          </Link>
        </nav>
        {showCreate ? (
          <div className="console-grid">
            <section className="position-panel maker-panel">
              <h2>Create a treasury position</h2>
              <p>
                Choose the allocation available to Aqua. Tokens stay in your
                wallet; you approve and ship after creating the position.
              </p>
              <form onSubmit={create}>
                <div className="maker-fields">
                  <label>
                    Asset allocation · bUSD
                    <input
                      ref={allocationRef}
                      name="assetAllocation"
                      inputMode="decimal"
                      required
                      aria-invalid={!!fieldError}
                      aria-describedby={
                        fieldError ? 'allocation-error' : undefined
                      }
                      value={asset}
                      onChange={(e) => setAsset(e.target.value)}
                    />
                  </label>
                  <label>
                    Reserve allocation · rUSD
                    <input
                      name="reserveAllocation"
                      inputMode="decimal"
                      required
                      aria-invalid={!!fieldError}
                      aria-describedby={
                        fieldError ? 'allocation-error' : undefined
                      }
                      value={reserve}
                      onChange={(e) => setReserve(e.target.value)}
                    />
                  </label>
                  <label>
                    Healthy trading fee
                    <select
                      value={fee}
                      onChange={(e) => setFee(e.target.value)}
                    >
                      <option value="10">0.10%</option>
                      <option value="30">0.30%</option>
                      <option value="100">1.00%</option>
                    </select>
                  </label>
                  <label>
                    Asset safety trigger
                    <select
                      value={trigger}
                      onChange={(e) => setTrigger(e.target.value)}
                    >
                      <option value="98">
                        Below $0.98 or 0.98 reserve units
                      </option>
                      <option value="99">
                        Below $0.99 or 0.99 reserve units
                      </option>
                    </select>
                  </label>
                  <label>
                    Maximum exit discount
                    <select
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                    >
                      <option value="0">0% below observation</option>
                      <option value="25">0.25% below observation</option>
                      <option value="50">0.50% below observation</option>
                      <option value="100">1.00% below observation</option>
                    </select>
                  </label>
                </div>
                {fieldError && (
                  <p
                    id="allocation-error"
                    role="alert"
                    className="notice error"
                  >
                    {fieldError}
                  </p>
                )}
                <p className="action-help">
                  Reserve must stay within $0.98–$1.02; asset premiums above
                  $1.02 halt trading. Observation limits: 24h asset / 25h
                  reserve. These are owner-controlled sample feeds, not live USD
                  prices. Changing the policy later requires a new position.
                </p>
                <button
                  className="primary-action"
                  disabled={!!busy || !!pendingHash || !d}
                  type="submit"
                >
                  {!account
                    ? 'Connect wallet'
                    : chain !== sepolia.id
                      ? 'Switch to Sepolia'
                      : 'Create position'}
                </button>
              </form>
            </section>
            <aside className="trade-ticket">
              <h2>Control the whole position</h2>
              <p>
                Healthy trades retain fees. Stressed trades may reduce asset
                exposure. Unsafe reserve prices or stale observations halt
                trading.
              </p>
              <p>
                You can cancel your Aqua allocation at any time. An exit
                discount limits the price against an accepted observation—not
                your total loss.
              </p>
              <h3>Test the lifecycle</h3>
              <p>
                Creation gives your position its own sample-price controls. Only
                its owner can change those observations. Share the position link
                so another wallet can trade against it.
              </p>
              <p>
                Fees require actual trades; earnings and exit availability are
                not guaranteed.
              </p>
            </aside>
          </div>
        ) : (
          <>
            {!position ? (
              <section
                className="position-panel maker-panel"
                aria-busy={loading}
              >
                <h2>
                  {loading ? 'Loading position…' : 'Position unavailable'}
                </h2>
                <button
                  className="text-action"
                  disabled={loading}
                  onClick={() => void refresh()}
                >
                  Retry position read
                </button>
              </section>
            ) : (
              <div className="console-grid">
                <section className="position-panel maker-panel">
                  <div className="maker-heading">
                    <div>
                      <p className="instrument-label">
                        {isOwner
                          ? 'Your treasury position'
                          : 'Treasury position'}
                      </p>
                      <h2>{state}</h2>
                    </div>
                    <button
                      className="text-action"
                      disabled={loading || !!busy}
                      onClick={() => void refresh()}
                    >
                      Refresh state
                    </button>
                  </div>
                  <p>
                    {state === 'Healthy'
                      ? 'Two-way trading is open. Each settled trade retains the configured fee.'
                      : state === 'Stressed'
                        ? 'Impaired-asset inflow is refused. Only reserve-in / asset-out trades are permitted.'
                        : state === 'Draft'
                          ? 'Created, not shipped. Complete approvals and Aqua allocation to open trading.'
                          : state === 'Cancelled'
                            ? 'No allocation remains in Aqua. The owner keeps their wallet assets.'
                            : position.observation.error}
                  </p>
                  <dl className="maker-metrics">
                    <div>
                      <dt>Remaining allocation · bUSD</dt>
                      <dd>{tokens(position.assetBalance)}</dd>
                    </div>
                    <div>
                      <dt>Remaining allocation · rUSD</dt>
                      <dd>{tokens(position.reserveBalance)}</dd>
                    </div>
                    <div>
                      <dt>Healthy fees earned · bUSD</dt>
                      <dd>{tokens(position.accounting[0])}</dd>
                    </div>
                    <div>
                      <dt>Healthy fees earned · rUSD</dt>
                      <dd>{tokens(position.accounting[1])}</dd>
                    </div>
                    <div>
                      <dt>Asset exited · bUSD</dt>
                      <dd>{tokens(position.accounting[4])}</dd>
                    </div>
                    <div>
                      <dt>Exit proceeds · rUSD</dt>
                      <dd>{tokens(position.accounting[5])}</dd>
                    </div>
                  </dl>
                  <p className="action-help">
                    Fees are settled token amounts retained by the owner, not
                    APY or total profit. Inventory remains exposed to asset
                    prices. {position.accounting[2].toString()} healthy trades ·{' '}
                    {position.accounting[3].toString()} exits.
                  </p>
                  <p className="action-help">
                    Self-trades do not establish outside revenue or reduced
                    total wallet exposure. Fees and exit proceeds are historical
                    flows, not extra balances to add to the remaining
                    allocation.
                  </p>
                  <dl
                    className="maker-metrics"
                    aria-label="Physical wallet backing"
                  >
                    <div>
                      <dt>Owner wallet · bUSD</dt>
                      <dd>{tokens(position.assetWallet)}</dd>
                    </div>
                    <div>
                      <dt>Owner wallet · rUSD</dt>
                      <dd>{tokens(position.reserveWallet)}</dd>
                    </div>
                    <div>
                      <dt>Backed output · bUSD</dt>
                      <dd>{tokens(position.assetAvailable)}</dd>
                    </div>
                    <div>
                      <dt>Backed output · rUSD</dt>
                      <dd>{tokens(position.reserveAvailable)}</dd>
                    </div>
                  </dl>
                  <p className="action-help">
                    At block {position.blockNumber.toString()}. Backed output is
                    capped by this allocation, wallet balance and Aqua
                    allowance. It is shared backing, not reserved liquidity or
                    guaranteed proceeds. Other strategies and wallet transfers
                    can change it.
                  </p>
                  <div
                    className="maker-gate"
                    aria-label="Permitted trade directions"
                  >
                    <p>
                      bUSD → treasury → rUSD{' '}
                      <strong>{state === 'Healthy' ? 'Open' : 'Closed'}</strong>
                    </p>
                    <p>
                      rUSD → treasury → bUSD{' '}
                      <strong>
                        {state === 'Healthy' || state === 'Stressed'
                          ? 'Permitted, subject to liquidity'
                          : 'Closed'}
                      </strong>
                    </p>
                  </div>
                  <dl className="maker-metrics">
                    <div>
                      <dt>Asset observation</dt>
                      <dd>{usd(position.assetObservedUsd)}</dd>
                      <small>
                        {age(position.assetRound)} · max{' '}
                        {position.assetMaxAge / 3600}h
                      </small>
                    </div>
                    <div>
                      <dt>Reserve observation</dt>
                      <dd>{usd(position.reserveObservedUsd)}</dd>
                      <small>
                        {age(position.reserveRound)} · max{' '}
                        {position.reserveMaxAge / 3600}h
                      </small>
                    </div>
                  </dl>
                  <p>
                    Healthy fee {percent(position.feeBps)} · trigger{' '}
                    {Number(formatUnits(position.trigger, 18)).toFixed(2)} USD
                    and reserve units · exit discount{' '}
                    {percent(position.discount)}.
                  </p>
                  <p className="action-help">
                    An accepted observation may lag the market. The exit
                    discount is not a cap on total loss. Testnet sample prices
                    can be refreshed only by this position’s owner.
                  </p>
                  <label className="maker-share">
                    Share this position
                    <input
                      readOnly
                      value={
                        typeof window === 'undefined'
                          ? ''
                          : `${window.location.origin}/?position=${position.hash}`
                      }
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                  <details className="signing-details">
                    <summary>Position and permissions</summary>
                    <p>
                      Aqua approval spender: <code>{d?.aqua}</code>
                    </p>
                    <p>
                      Trade approval spender: <code>{d?.router}</code>
                    </p>
                    <p>
                      Owner: <code>{position.owner}</code>
                    </p>
                    <p>
                      Order: <code>{position.hash}</code>
                    </p>
                    <p>
                      Policy: <code>{position.policy}</code>
                    </p>
                    <p>Read at block {position.blockNumber.toString()}.</p>
                    <p>
                      Currently backed output: {tokens(position.assetAvailable)}{' '}
                      bUSD / {tokens(position.reserveAvailable)} rUSD. Other
                      Aqua allocations can share the owner’s wallet; these are
                      not segregated reserves.
                    </p>
                  </details>
                </section>
                <aside className="trade-ticket">
                  {isOwner && !position.shipped && !position.cancelled ? (
                    <>
                      <h2>Activate your allocation</h2>
                      <p>
                        Wallet balance: {tokens(position.assetWallet)} bUSD /{' '}
                        {tokens(position.reserveWallet)} rUSD.
                      </p>
                      <p>
                        Planned allocation: {tokens(position.assetAllocation)}{' '}
                        bUSD / {tokens(position.reserveAllocation)} rUSD.
                      </p>
                      <div className="maker-actions">
                        <button
                          disabled={
                            !ready ||
                            position.assetAllowance >= position.assetAllocation
                          }
                          onClick={() => void approveAllocation(true)}
                        >
                          1.{' '}
                          {position.assetAllowance >= position.assetAllocation
                            ? 'bUSD approved'
                            : 'Approve bUSD allocation'}
                        </button>
                        <button
                          disabled={
                            !ready ||
                            position.reserveAllowance >=
                              position.reserveAllocation
                          }
                          onClick={() => void approveAllocation(false)}
                        >
                          2.{' '}
                          {position.reserveAllowance >=
                          position.reserveAllocation
                            ? 'rUSD approved'
                            : 'Approve rUSD allocation'}
                        </button>
                        <button
                          className="primary-action"
                          disabled={
                            !ready ||
                            position.assetAllowance <
                              position.assetAllocation ||
                            position.reserveAllowance <
                              position.reserveAllocation
                          }
                          onClick={() => void ship()}
                        >
                          3. Ship position to Aqua
                        </button>
                      </div>
                      <p className="action-help">
                        Approvals cover the displayed amounts, not unlimited
                        spending. Shipment records virtual balances; no
                        custodial deposit occurs.
                      </p>
                    </>
                  ) : position.shipped ? (
                    <>
                      <h2>
                        {state === 'Stressed'
                          ? 'Trade the permitted exit'
                          : 'Trade this position'}
                      </h2>
                      {isOwner && (
                        <p className="action-help">
                          A trade from your own wallet tests settlement, not
                          independent fee revenue. Share the link for another
                          participant.
                        </p>
                      )}
                      <div className="maker-fields maker-single">
                        <label>
                          You pay
                          <select
                            value={assetIn ? 'asset' : 'reserve'}
                            onChange={(e) =>
                              setAssetIn(e.target.value === 'asset')
                            }
                          >
                            <option
                              value="asset"
                              disabled={state !== 'Healthy'}
                            >
                              bUSD · asset
                            </option>
                            <option value="reserve">rUSD · reserve</option>
                          </select>
                        </label>
                        <label>
                          Trade amount
                          <input
                            name="tradeAmount"
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            aria-describedby="quote-status"
                          />
                        </label>
                      </div>
                      {account && (
                        <p className="action-help">
                          Your available wallet balance:{' '}
                          {tokens(currentTradeWallet?.balance)}{' '}
                          {assetIn ? 'bUSD' : 'rUSD'}.
                        </p>
                      )}
                      <output id="quote-status">
                        {quoting
                          ? 'Updating quote…'
                          : quoteError ||
                            (!observation
                              ? 'Exit unavailable: policy is halted.'
                              : '')}
                      </output>
                      <dl className="quote-terms">
                        <div>
                          <dt>You receive</dt>
                          <dd>
                            {tokens(quote?.output)} {assetIn ? 'rUSD' : 'bUSD'}
                          </dd>
                        </div>
                        <div>
                          <dt>Minimum received</dt>
                          <dd>{tokens(quote?.minimum)}</dd>
                        </div>
                        <div>
                          <dt>Healthy fee included</dt>
                          <dd>
                            {state === 'Healthy'
                              ? percent(position.feeBps)
                              : 'None on stressed exits'}
                          </dd>
                        </div>
                      </dl>
                      <button
                        className="primary-action"
                        disabled={
                          !!busy ||
                          !!pendingHash ||
                          (!!account &&
                            chain === sepolia.id &&
                            (!quote || !currentTradeWallet)) ||
                          (!!quote && now >= Number(quote.deadline))
                        }
                        onClick={() =>
                          void (!account
                            ? connect()
                            : chain !== sepolia.id
                              ? switchNetwork()
                              : trade())
                        }
                      >
                        {!account
                          ? 'Connect wallet'
                          : chain !== sepolia.id
                            ? 'Switch to Sepolia'
                            : !currentTradeWallet
                              ? 'Reading wallet balance…'
                              : quote &&
                                  currentTradeWallet.allowance < quote.input
                                ? `Approve ${tokens(quote.input)} ${assetIn ? 'bUSD' : 'rUSD'} for trade`
                                : `Swap ${assetIn ? 'bUSD for rUSD' : 'rUSD for bUSD'}`}
                      </button>
                      <p className="action-help">
                        If required, first approve this trade amount. Then
                        review the refreshed quote and click again to swap.
                        Slippage tolerance: 0.50%. Gas is paid in Sepolia ETH.
                      </p>
                      <button
                        className="text-action"
                        disabled={!!busy}
                        onClick={() => setRefreshQuote((v) => v + 1)}
                      >
                        Refresh quote
                      </button>
                      {lastTrade && (
                        <p className="notice success">
                          Settled: {tokens(lastTrade.input)}{' '}
                          {lastTrade.assetIn ? 'bUSD' : 'rUSD'} paid →{' '}
                          {tokens(lastTrade.output)}{' '}
                          {lastTrade.assetIn ? 'rUSD' : 'bUSD'} received.
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <h2>
                        {position.cancelled
                          ? 'Position closed'
                          : 'Not trading yet'}
                      </h2>
                      <p>
                        {position.cancelled
                          ? 'Create a new position to allocate liquidity again.'
                          : 'This owner has not shipped their position to Aqua.'}
                      </p>
                    </>
                  )}
                  {isOwner && position.scenario !== zeroAddress && (
                    <section className="maker-section">
                      <h3>Sample-price controls</h3>
                      <p>
                        No live market prices. These actions change only this
                        position’s observations.
                      </p>
                      <div className="maker-actions">
                        {[
                          'Healthy',
                          'Asset stressed',
                          'Reserve unsafe',
                          'Both unsafe',
                        ].map((label, i) => (
                          <button
                            key={label}
                            disabled={!ready || position.cancelled}
                            onClick={() =>
                              void run(
                                `Setting ${label.toLowerCase()} sample`,
                                async () => {
                                  await transact({
                                    address: position.scenario,
                                    abi: scenarioAbi,
                                    functionName: 'setScenario',
                                    args: [i],
                                  });
                                },
                              )
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {isOwner && position.shipped && (
                    <section className="maker-section">
                      <h3>Owner controls</h3>
                      <div className="maker-actions">
                        {position.assetAllowance < position.assetBalance && (
                          <button
                            disabled={!ready}
                            onClick={() => void approveAllocation(true)}
                          >
                            Restore bUSD backing approval
                          </button>
                        )}
                        {position.reserveAllowance <
                          position.reserveBalance && (
                          <button
                            disabled={!ready}
                            onClick={() => void approveAllocation(false)}
                          >
                            Restore rUSD backing approval
                          </button>
                        )}
                        <CancelPositionDialog
                          disabled={!ready}
                          onConfirm={() => void cancel()}
                        />
                      </div>
                    </section>
                  )}
                </aside>
              </div>
            )}
          </>
        )}
        <section className="maker-faucet">
          <h2>Need sample tokens?</h2>
          <p>
            Each wallet can claim each token once. They have no monetary value;
            Sepolia ETH is still required for gas.
          </p>
          <div className="maker-actions">
            {[true, false].map((side) => (
              <button
                key={String(side)}
                disabled={!ready || !d}
                onClick={() =>
                  void run('Claiming sample tokens', async () => {
                    if (d)
                      await transact({
                        address: side ? d.badToken : d.goodToken,
                        abi: erc20Abi,
                        functionName: 'claim',
                      });
                  })
                }
              >
                Claim {side ? 'bUSD' : 'rUSD'}
              </button>
            ))}
          </div>
          {!account && <p>Connect your wallet to claim.</p>}
        </section>
      </main>
      <footer className="site-footer">
        <span>Powered by Aqua — © Degensoft Ltd 2025</span>
        <span>Powered by SwapVM — © Degensoft Ltd 2025</span>
        <a
          href="https://github.com/qdeeworld/breakwater"
          target="_blank"
          rel="noreferrer"
        >
          Source and limitations ↗
        </a>
      </footer>
    </div>
  );
}
