'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  X,
  Check,
} from 'lucide-react';
import { ApertureMark } from './aperture-mark';

const conditions = [
  {
    name: 'Healthy',
    short: 'Both directions',
    icon: ArrowLeftRight,
    title: 'Let both sides trade.',
    copy: 'When accepted asset and reserve observations meet your policy, the position permits two-way trading and retains your configured fee on each healthy fill.',
    buy: true,
    sell: true,
  },
  {
    name: 'Asset stressed',
    short: 'Exit direction only',
    icon: ArrowRight,
    title: 'Stop taking on the impaired asset.',
    copy: 'When the asset breaches your limits, the same position refuses additional asset inflow. A counterparty may still buy that asset with healthy reserve tokens at a bounded, observation-derived price.',
    buy: false,
    sell: true,
  },
  {
    name: 'Reserve unsafe',
    short: 'Trading halted',
    icon: X,
    title: 'An unsafe reserve is not an exit.',
    copy: 'If the reserve is unsafe, both directions halt. Invalid or stale observations and excessive asset premiums also halt trading. Accepted observations can still lag the market.',
    buy: false,
    sell: false,
  },
];

export function LandingPage() {
  const [selected, setSelected] = useState(0);
  const condition = conditions[selected];
  return (
    <main className="aperture-home">
      <a className="skip-link" href="#home-title">
        Skip to content
      </a>
      <section className="aperture-hero" aria-labelledby="home-title">
        <Image
          className="aperture-art"
          src="/images/aperture-hero.webp"
          width={1774}
          height={887}
          alt=""
          priority
          unoptimized
        />
        <header className="aperture-header">
          <Link
            href="/"
            className="aperture-brand"
            aria-label="Breakwater home"
          >
            <ApertureMark />
            Breakwater
          </Link>
          <nav aria-label="Main navigation">
            <a href="#permissions">Product</a>
            <a href="#how-it-works">How it works</a>
            <Link href="/positions">Find liquidity</Link>
          </nav>
          <Link className="aperture-button header-launch" href="/treasury">
            Launch app <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </header>
        <div className="aperture-hero-content">
          <h1 id="home-title" tabIndex={-1}>
            Put liquidity
            <br />
            to work.
            <br />
            <span>Set its limits.</span>
          </h1>
          <p>
            A treasury-owned position that earns trading fees while healthy and
            changes its permitted trades under stress.
          </p>
          <div className="aperture-actions">
            <Link className="aperture-button" href="/treasury">
              Launch app <ArrowUpRight aria-hidden="true" />
            </Link>
            <Link className="aperture-link" href="/positions">
              Explore positions <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <p className="aperture-testnet">
            Sepolia prototype · No-value test tokens
          </p>
        </div>
        <div
          className="aperture-art-labels"
          aria-label="Illustration of healthy two-way trading"
        >
          <span className="art-asset">Asset in</span>
          <span className="art-healthy">Healthy · two-way trading</span>
          <ArrowRight className="art-in-arrow" aria-hidden="true" />
          <ArrowLeft className="art-out-arrow" aria-hidden="true" />
          <span className="art-reserve">Reserve in</span>
          <span className="art-caption">Illustrative permissions</span>
        </div>
      </section>
      <section
        className="aperture-permissions"
        id="permissions"
        aria-labelledby="permissions-title"
      >
        <div className="permission-heading">
          <h2 id="permissions-title">
            One position.
            <br />
            <span>Your conditions.</span>
          </h2>
          <fieldset className="permission-picker">
            <legend className="sr-only">Illustrative policy condition</legend>
            {conditions.map((item, index) => (
              <button
                key={item.name}
                type="button"
                aria-pressed={selected === index}
                aria-controls="permission-explanation"
                onClick={() => setSelected(index)}
              >
                <span>{item.name}</span>
                <strong>{item.short}</strong>
                <item.icon aria-hidden="true" />
              </button>
            ))}
          </fieldset>
        </div>
        <p className="permission-limit">
          Permitted does not mean guaranteed. Exits need accepted observations,
          backing and a willing buyer.
        </p>
        <div className="permission-explanation" id="permission-explanation">
          <div
            className="permission-copy"
            aria-live="polite"
            aria-atomic="true"
          >
            <h3>{condition.title}</h3>
            <p className="illustration-label">
              Illustration only · no live price data
            </p>
            <p>{condition.copy}</p>
          </div>
          <div
            className="permission-routes"
            aria-label={`${condition.name} trading permissions`}
          >
            <div className="permission-route" data-open={condition.buy}>
              <span>Treasury buys bUSD</span>
              {condition.buy ? (
                <ArrowLeft aria-hidden="true" />
              ) : (
                <X aria-hidden="true" />
              )}
              <strong>{condition.buy ? 'Permitted' : 'Blocked'}</strong>
            </div>
            <div className="permission-route" data-open={condition.sell}>
              <span>Treasury sells bUSD</span>
              {condition.sell ? (
                <ArrowRight aria-hidden="true" />
              ) : (
                <X aria-hidden="true" />
              )}
              <strong>{condition.sell ? 'Permitted' : 'Blocked'}</strong>
            </div>
          </div>
        </div>
      </section>
      <section
        className="aperture-process"
        id="how-it-works"
        aria-labelledby="process-title"
      >
        <div>
          <h2 id="process-title">
            Your tokens.
            <br />
            <span>Your trading rules.</span>
          </h2>
          <p>
            Tokens stay in your wallet. Aqua tracks the position’s allocation;
            SwapVM enforces its trading policy when a swap executes.
          </p>
          <Link href="/treasury" className="aperture-link">
            Create your position <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
        <ol>
          <li>
            <span>1</span>
            <div>
              <h3>Choose your allocation.</h3>
              <p>
                Set the amount of each sample token, healthy fee, stress trigger
                and exit discount. You can rehearse the policy against
                historical checkpoints before creating.
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>Approve. Then activate.</h3>
              <p>
                Review each wallet request. Approvals and Aqua activation are
                separate steps; an allocation is not a deposit or reserved
                liquidity.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>See what actually changed.</h3>
              <p>
                Track settled fees, remaining inventory and exit proceeds.
                Cancel the allocation when you choose. Changing its policy
                requires a new position.
              </p>
            </div>
          </li>
        </ol>
      </section>
      <section className="aperture-close" aria-labelledby="try-title">
        <div>
          <ApertureMark />
          <h2 id="try-title">
            Put your conditions
            <br />
            into practice.
          </h2>
        </div>
        <div>
          <Link className="aperture-button" href="/treasury">
            Launch app <ArrowUpRight aria-hidden="true" />
          </Link>
          <p>
            Try the complete lifecycle on Sepolia.
            <br />
            No-value tokens. Sepolia ETH required for gas.
          </p>
        </div>
      </section>
      <footer className="aperture-footer">
        <div className="aperture-footer-top">
          <Link href="/" className="aperture-brand">
            <ApertureMark />
            Breakwater
          </Link>
          <a
            href="https://github.com/qdeeworld/breakwater"
            target="_blank"
            rel="noreferrer"
          >
            Source and limitations <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        </div>
        <p>
          Testnet prototype, not an audited production system. Sample prices are
          owner-controlled, not live market feeds. Fees are not APY or total
          profit. Exit discounts do not cap total loss. There is no guaranteed
          exit, recovery or earnings.
        </p>
        <div className="aperture-attribution">
          <span>Powered by Aqua — © Degensoft Ltd 2025</span>
          <span>Powered by SwapVM — © Degensoft Ltd 2025</span>
          <span>
            <Check size={14} aria-hidden="true" /> Non-custodial allocation
          </span>
        </div>
      </footer>
    </main>
  );
}
