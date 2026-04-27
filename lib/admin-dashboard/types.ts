export type RevenuePoint = { month: string; revenue: number };
export type GrowthPoint = { date: string; count: number };
export type ActivityEvent =
  | { type: 'join'; at: Date; userId: string; displayName: string; avatarUrl: string | null }
  | { type: 'cancel'; at: Date; userId: string; displayName: string; avatarUrl: string | null }
  | { type: 'post'; at: Date; userId: string; displayName: string; avatarUrl: string | null; threadId: string; categoryName: string | null }
  | { type: 'failed_payment'; at: Date; userId: string | null; displayName: string; amount: number };
