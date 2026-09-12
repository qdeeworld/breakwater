'use client';

import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function PositionShare({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [copying, setCopying] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const link =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}/treasury?position=${hash}`;
  async function copy() {
    setCopying(true);
    setCopied(false);
    setCopyError('');
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopyError(
        'Copy was unavailable. Select the link below and copy it manually.',
      );
      if (details.current) details.current.open = true;
      input.current?.focus();
      input.current?.select();
    } finally {
      setCopying(false);
    }
  }
  return (
    <div className="position-share">
      <button
        className="text-action"
        onClick={() => void copy()}
        disabled={copying}
      >
        {copied ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
        {copying ? 'Copying…' : copied ? 'Link copied' : 'Copy position link'}
      </button>
      <output className="sr-only">
        {copied ? 'Position link copied to clipboard.' : ''}
      </output>
      <details ref={details}>
        <summary>View link</summary>
        <label className="maker-share">
          Position link
          <input
            ref={input}
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
          />
        </label>
      </details>
      {copyError && (
        <p role="alert" className="copy-error">
          {copyError}
        </p>
      )}
    </div>
  );
}
