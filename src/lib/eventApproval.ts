export type EventApproval = 'approved' | 'pending' | 'rejected';

/** Public bazaars are checked by the platform; the others need no approval (`null`). */
export function eventApproval(event: {
  visibility: string;
  approvalStatus?: string;
  isApproved?: boolean;
}): EventApproval | null {
  if (event.visibility !== 'public') return null;
  if (event.approvalStatus === 'rejected') return 'rejected';
  if (event.approvalStatus === 'pending' || event.isApproved === false) return 'pending';
  return 'approved';
}
