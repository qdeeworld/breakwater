import { ArrowUpRight } from 'lucide-react';
import { actionHeading, type TransactionStage } from '@/lib/action-feedback';

export function ActionFeedback({
  busy,
  status,
  error,
  pending,
  hash,
  stage,
  context,
}: {
  busy: string;
  status: string;
  error: string;
  pending: boolean;
  hash?: string;
  stage: TransactionStage;
  context?: string;
}) {
  if (!busy && !status && !error && !pending) return null;
  return (
    <div className={`action-feedback ${error ? 'action-feedback-error' : ''}`}>
      <div role={error ? 'alert' : 'status'} aria-atomic="true">
        <strong>{actionHeading(stage, busy, pending, error)}</strong>
        {context && <p>{context}</p>}
        {(error || status) && <p>{error || status}</p>}
      </div>
      {hash && (
        <a
          href={`https://sepolia.etherscan.io/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
