export type TransactionStage = 'idle' | 'wallet' | 'confirming' | 'confirmed';
export type FeedbackArea = 'global' | 'create' | 'position' | 'faucet';
export type FeedbackContext = { order?: string; account?: string };
export type SavedFeedback = { area: FeedbackArea; context: FeedbackContext };

/** Saved display context is optional for legacy records and never authorizes a call. */
export function restoreFeedback(record: unknown): SavedFeedback {
  if (!record || typeof record !== 'object') return { area: 'global', context: {} };
  const saved = record as Record<string, unknown>;
  const context = saved.context && typeof saved.context === 'object'
    ? saved.context as Record<string, unknown> : {};
  const account = typeof context.account === 'string' && /^0x[0-9a-fA-F]{40}$/.test(context.account)
    ? context.account : undefined;
  if (!account) return { area: 'global', context: {} };
  const area: FeedbackArea = saved.area === 'create' || saved.area === 'position' || saved.area === 'faucet'
    ? saved.area : 'global';
  const order = area === 'position' && typeof context.order === 'string' && /^0x[0-9a-fA-F]{64}$/.test(context.order)
    ? context.order : undefined;
  return { area, context: { account, ...(order ? { order } : {}) } };
}

export function pendingFeedbackRecord(hash: string, chainId: number, feedback: SavedFeedback) {
  return { hash, chainId, area: feedback.area, context: { ...feedback.context } };
}

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
