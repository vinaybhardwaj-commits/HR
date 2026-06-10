import type { AppraisalStatus } from '@/lib/status';

export type Action =
  | 'self_submit' | 'score_submit' | 'mark_discussion'
  | 'concur_agree' | 'concur_remarks' | 'concur_disagree'
  | 'hr_resolve' | 'close' | 'cancel' | 'reopen';

/** The ONLY place appraisal status transitions are defined. */
const TRANSITIONS: Record<Action, { from: AppraisalStatus[]; to: AppraisalStatus }> = {
  self_submit:     { from: ['invited'], to: 'self_submitted' },
  // score_submit from 'invited' is allowed ONLY when appraisal.self_overridden = true (checked by caller)
  score_submit:    { from: ['self_submitted', 'invited'], to: 'scored' },
  mark_discussion: { from: ['scored'], to: 'discussed' },
  concur_agree:    { from: ['discussed'], to: 'concurred' },
  concur_remarks:  { from: ['discussed'], to: 'concurred' },
  concur_disagree: { from: ['discussed'], to: 'disagreed' },
  hr_resolve:      { from: ['disagreed'], to: 'hr_review' },
  close:           { from: ['concurred', 'hr_review'], to: 'closed' },
  cancel:          { from: ['invited','self_submitted','scored','discussed','concurred','disagreed','hr_review'], to: 'cancelled' },
  reopen:          { from: ['scored','discussed','concurred','disagreed','hr_review'], to: 'self_submitted' }
};

export function nextStatus(current: AppraisalStatus, action: Action): AppraisalStatus {
  const t = TRANSITIONS[action];
  if (!t.from.includes(current)) {
    throw new Error(`Illegal transition: ${action} from ${current}`);
  }
  return t.to;
}
