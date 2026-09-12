'use client';

import { useRef, useState, type RefObject, type SubmitEvent } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { ApertureMark } from './aperture-mark';
import {
  settingsFromForm,
  settingsKey,
  type Settings,
} from '@/lib/rehearsal-math';
import { PolicyRehearsal } from './policy-rehearsal';

type Props = {
  asset: string;
  reserve: string;
  fee: string;
  trigger: string;
  discount: string;
  onAsset: (v: string) => void;
  onReserve: (v: string) => void;
  onFee: (v: string) => void;
  onTrigger: (v: string) => void;
  onDiscount: (v: string) => void;
  settings?: Settings;
  fieldError: string;
  onError: (v: string) => void;
  allocationRef: RefObject<HTMLInputElement | null>;
  locked: boolean;
  configured: boolean;
  createLabel: string;
  onCreate: (event: SubmitEvent<HTMLFormElement>) => void;
};

const stages = ['Allocation', 'Limits', 'Review'];

export function CreationGuide({ allocationRef, ...p }: Props) {
  const [step, setStep] = useState(0);
  const [condition, setCondition] = useState('Stressed');
  const [reviewed, setReviewed] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);
  function move(next: number) {
    if (p.locked) return;
    if (next > 0) {
      try {
        settingsFromForm(p.asset, p.reserve, p.fee, p.trigger, p.discount);
      } catch (e) {
        p.onError(
          e instanceof Error ? e.message : 'Enter valid positive allocations.',
        );
        setStep(0);
        requestAnimationFrame(() => allocationRef.current?.focus());
        return;
      }
    }
    p.onError('');
    setStep(next);
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  const buy = condition === 'Healthy';
  const sell = condition !== 'Halted';
  return (
    <div className="guided-workspace">
      <section className="setup-panel" aria-label="Create a treasury position">
        <nav aria-label="Position setup" className="setup-steps">
          {stages.map((label, i) => (
            <button
              key={label}
              type="button"
              disabled={p.locked || i > step}
              aria-current={step === i ? 'step' : undefined}
              onClick={() => move(i)}
            >
              <span>
                {i < step ? <Check size={16} aria-hidden="true" /> : i + 1}
              </span>
              {label}
            </button>
          ))}
        </nav>
        <h2 ref={titleRef} tabIndex={-1}>
          {
            [
              'Choose your allocation',
              'Set your trading limits',
              'Review your position',
            ][step]
          }
        </h2>
        <p className="setup-description">
          {
            [
              'Choose how much of each token this position may trade. Your tokens stay in your wallet.',
              'Earn a fee in healthy conditions. Decide when to stop buying the asset and how to price permitted exits.',
              'Check your allocation and policy before the first wallet confirmation.',
            ][step]
          }
        </p>
        <form
          id="create-position"
          noValidate
          onSubmit={(event) => {
            if (step < 2) {
              event.preventDefault();
              move(step + 1);
            } else p.onCreate(event);
          }}
        >
          <fieldset
            className="creation-fieldset"
            disabled={p.locked}
            hidden={step !== 0}
          >
            <legend className="sr-only">Token allocation</legend>
            <div className="allocation-inputs">
              <label>
                Asset allocation
                <span className="token-input">
                  <input
                    ref={allocationRef}
                    name="assetAllocation"
                    inputMode="decimal"
                    required
                    aria-invalid={!!p.fieldError}
                    aria-describedby={
                      p.fieldError ? 'allocation-error' : 'allocation-help'
                    }
                    value={p.asset}
                    onChange={(e) => {
                      p.onAsset(e.target.value);
                      p.onError('');
                    }}
                  />
                  <strong>bUSD</strong>
                </span>
                <span className="field-caption">
                  The asset your policy limits buying
                </span>
              </label>
              <label>
                Reserve allocation
                <span className="token-input">
                  <input
                    name="reserveAllocation"
                    inputMode="decimal"
                    required
                    aria-invalid={!!p.fieldError}
                    aria-describedby={
                      p.fieldError ? 'allocation-error' : 'allocation-help'
                    }
                    value={p.reserve}
                    onChange={(e) => {
                      p.onReserve(e.target.value);
                      p.onError('');
                    }}
                  />
                  <strong>rUSD</strong>
                </span>
                <span className="field-caption">
                  The token received when selling the asset
                </span>
              </label>
            </div>
            <p id="allocation-help" className="setup-note">
              <LockKeyhole size={16} aria-hidden="true" /> No deposit now.
              Approval and Aqua activation come after creation. Shared wallet
              backing is not reserved liquidity.
            </p>
          </fieldset>
          <fieldset
            className="creation-fieldset"
            disabled={p.locked}
            hidden={step !== 1}
          >
            <legend className="sr-only">Trading policy</legend>
            <div className="policy-inputs">
              <label>
                Healthy trading fee
                <select value={p.fee} onChange={(e) => p.onFee(e.target.value)}>
                  <option value="10">0.10%</option>
                  <option value="30">0.30%</option>
                  <option value="100">1.00%</option>
                </select>
                <span className="field-caption">
                  Retained on settled healthy trades; not an APY.
                </span>
              </label>
              <label>
                Stop buying the asset below
                <select
                  value={p.trigger}
                  onChange={(e) => p.onTrigger(e.target.value)}
                >
                  <option value="98">$0.98 or 0.98 reserve units</option>
                  <option value="99">$0.99 or 0.99 reserve units</option>
                </select>
                <span className="field-caption">
                  Either boundary can trigger the restriction.
                </span>
              </label>
              <label>
                Maximum exit discount
                <select
                  value={p.discount}
                  aria-describedby="discount-help"
                  onChange={(e) => p.onDiscount(e.target.value)}
                >
                  <option value="0">0% below observation</option>
                  <option value="25">0.25% below observation</option>
                  <option value="50">0.50% below observation</option>
                  <option value="100">1.00% below observation</option>
                </select>
                <span id="discount-help" className="field-caption">
                  Relative to accepted price data. Not a cap on total loss.
                </span>
              </label>
            </div>
          </fieldset>
          {p.fieldError && (
            <p id="allocation-error" role="alert" className="notice error">
              {p.fieldError}
            </p>
          )}
          <div hidden={step !== 2} className="setup-review">
            <dl className="review-allocation">
              <div>
                <dt>Asset · bUSD</dt>
                <dd>{p.asset}</dd>
              </div>
              <div>
                <dt>Reserve · rUSD</dt>
                <dd>{p.reserve}</dd>
              </div>
            </dl>
            <dl className="review-policy">
              <div>
                <dt>Healthy fee</dt>
                <dd>{(Number(p.fee) / 100).toFixed(2)}%</dd>
              </div>
              <div>
                <dt>Stop-buying trigger</dt>
                <dd>
                  ${(Number(p.trigger) / 100).toFixed(2)} or{' '}
                  {Number(p.trigger) / 100} reserve
                </dd>
              </div>
              <div>
                <dt>Exit discount</dt>
                <dd>
                  {(Number(p.discount) / 100).toFixed(2)}% below observation
                </dd>
              </div>
            </dl>
            <p className="setup-note">
              Limits become immutable on creation. Changing them later requires
              a new position.
            </p>
            <div className="activation-brief">
              <ShieldCheck size={20} aria-hidden="true" />
              <p>
                <strong>Create, then activate.</strong> First create the
                position. Then approve each token as needed and activate its
                Aqua allocation in separate wallet confirmations. No custodial
                deposit.
              </p>
            </div>
            {p.settings && reviewed === settingsKey(p.settings) && (
              <p className="review-checked">
                <Check size={16} aria-hidden="true" /> Rehearsal completed with
                these settings.
              </p>
            )}
          </div>
          <div className="setup-actions">
            {step > 0 && (
              <button
                className="secondary-action"
                type="button"
                disabled={p.locked}
                onClick={() => move(step - 1)}
              >
                <ArrowLeft size={16} aria-hidden="true" /> Back
              </button>
            )}
            <button
              className="primary-action"
              type="submit"
              disabled={p.locked || (step === 2 && !p.configured)}
            >
              {step === 0
                ? 'Continue to limits'
                : step === 1
                  ? 'Review position'
                  : p.createLabel}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </form>
      </section>
      <aside className="policy-preview" aria-labelledby="policy-preview-title">
        <div className="policy-preview-heading">
          <ApertureMark />
          <h2 id="policy-preview-title">Your trading rules</h2>
        </div>
        <p>One position. Different permissions as conditions change.</p>
        <fieldset
          className="policy-condition"
          aria-label="Illustrative policy condition"
        >
          {['Healthy', 'Stressed', 'Halted'].map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={s === condition}
              onClick={() => setCondition(s)}
            >
              {s}
            </button>
          ))}
        </fieldset>
        <p className="preview-context">
          Illustration only · not live price data
        </p>
        <div className="policy-flow" data-condition={condition}>
          <div className={buy ? 'flow-route permitted' : 'flow-route blocked'}>
            <div>
              <span>Treasury buys</span>
              <strong>bUSD</strong>
            </div>
            <span className="flow-line" aria-hidden="true">
              {buy ? <ArrowLeft /> : <LockKeyhole />}
            </span>
            <div>
              <strong>{buy ? 'Permitted' : 'Blocked'}</strong>
              <span>
                {buy
                  ? `${Number(p.fee) / 100}% healthy fee`
                  : 'No additional asset inflow'}
              </span>
            </div>
          </div>
          <div className={sell ? 'flow-route permitted' : 'flow-route blocked'}>
            <div>
              <span>Treasury sells</span>
              <strong>bUSD</strong>
            </div>
            <span className="flow-line" aria-hidden="true">
              {sell ? <ArrowRight /> : <LockKeyhole />}
            </span>
            <div>
              <strong>{sell ? 'Permitted' : 'Blocked'}</strong>
              <span>
                {condition === 'Stressed'
                  ? 'Receive healthy reserve'
                  : sell
                    ? `${Number(p.fee) / 100}% healthy fee`
                    : 'Neither direction trades'}
              </span>
            </div>
          </div>
        </div>
        <p className="preview-explanation">
          {condition === 'Healthy'
            ? 'Both sides may trade while accepted observations meet the policy.'
            : condition === 'Stressed'
              ? `Below $${(Number(p.trigger) / 100).toFixed(2)} or ${Number(p.trigger) / 100} reserve units, stop buying bUSD. Sales may proceed at no more than ${Number(p.discount) / 100}% below the accepted observation.`
              : 'An unsafe reserve, asset premium above $1.02, or invalid or stale data blocks both directions.'}
        </p>
        <p className="preview-caution">
          Permission is not an available exit. A trade still needs backing, a
          willing buyer and a fresh executable quote.
        </p>
        <details className="policy-boundaries">
          <summary>Fixed safety boundaries</summary>
          <p>
            Reserve must remain within $0.98–$1.02. Asset premiums above $1.02
            halt trading. Observation age limits: 24h asset / 25h reserve.
            Accepted observations can lag the market.
          </p>
          <p>
            Sepolia uses owner-controlled sample prices and no-value bUSD /
            rUSD—not live market feeds. The exit discount is not a maximum-loss
            guarantee.
          </p>
        </details>
      </aside>
      {step === 2 && (
        <details className="rehearsal-drawer">
          <summary>
            <span>Test these limits against history</span>
            <span>Optional · no wallet needed</span>
          </summary>
          <PolicyRehearsal settings={p.settings} onReviewed={setReviewed} />
        </details>
      )}
    </div>
  );
}
