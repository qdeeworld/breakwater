export type TransactionStage = 'idle' | 'wallet' | 'confirming' | 'confirmed';

/** Display only: a receipt is never treated as confirmed merely because it exists. */
export function actionHeading(
  stage: TransactionStage,
  busy: string,
  pending: boolean,
  error: string,
) {
  if (pending && (!busy || error)) return 'Confirmation unresolved';
  if (error && stage === 'confirmed')
    return 'Confirmed — follow-up needs attention';
  if (error) return 'Action not completed';
  if (pending || stage === 'confirming') return 'Waiting for confirmation';
  if (stage === 'wallet') return 'Confirm in your wallet';
  if (stage === 'confirmed') return 'Transaction confirmed';
  return busy || 'Latest update';
}
