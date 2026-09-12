export type TransactionStage = 'idle' | 'wallet' | 'confirming' | 'confirmed';
export type FeedbackArea = 'global' | 'create' | 'position' | 'faucet';
export type FeedbackContext = { order?: string; account?: string };

/** A different wallet or position must not inherit an earlier action's result. */
export function feedbackPlacement({
  area,
  showCreate,
  positionHash,
  account,
  context,
}: {
  area: FeedbackArea;
  showCreate: boolean;
  positionHash?: string;
  account?: string;
  context: FeedbackContext;
}): FeedbackArea {
  if (context.account?.toLowerCase() !== account?.toLowerCase()) return 'global';
  if (area === 'create' && showCreate) return 'create';
  if (area === 'position' && !showCreate && positionHash && context.order === positionHash)
    return 'position';
  if (area === 'faucet') return 'faucet';
  return 'global';
}

export function feedbackContextLabel(context: FeedbackContext) {
  const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-4)}`;
  const parts = [
    context.order ? `position ${short(context.order)}` : '',
    context.account ? `wallet ${short(context.account)}` : '',
  ].filter(Boolean);
  return parts.length ? `For ${parts.join(' · ')}` : undefined;
}

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
