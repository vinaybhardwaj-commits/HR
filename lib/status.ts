export const STATUSES = [
  'invited','self_submitted','scored','discussed','concurred',
  'disagreed','hr_review','closed','cancelled'
] as const;
export type AppraisalStatus = (typeof STATUSES)[number];

/** Single source of truth for status chips on all three surfaces. */
export const STATUS_META: Record<AppraisalStatus, { label: string; cls: string }> = {
  invited:        { label: 'Invited',          cls: 'bg-slate-100 text-slate-600' },
  self_submitted: { label: 'Self-appraisal in', cls: 'bg-blue-50 text-blue-700' },
  scored:         { label: 'Scored — awaiting 1:1', cls: 'bg-violet-50 text-violet-700' },
  discussed:      { label: 'Discussed',        cls: 'bg-teal-50 text-teal-700' },
  concurred:      { label: 'Concurred',        cls: 'bg-green-50 text-green-700' },
  disagreed:      { label: 'Disagreed',        cls: 'bg-red-50 text-red-700' },
  hr_review:      { label: 'HR review',        cls: 'bg-red-50 text-red-700' },
  closed:         { label: 'Closed',           cls: 'bg-green-600 text-white' },
  cancelled:      { label: 'Cancelled',        cls: 'bg-slate-100 text-slate-400 line-through' }
};
