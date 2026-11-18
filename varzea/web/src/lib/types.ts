export type Role = "DIRETORIA" | "COMISSAO" | "JOGADOR";
export type Permission =
  | "club.update"
  | "members.add"
  | "members.edit"
  | "members.remove"
  | "members.assignRole"
  | "invites.create"
  | "matches.manage"
  | "payments.manage"
  | "bot.configure"
  | "announcements.post";

export type Attendance = "CONFIRMED" | "PENDING" | "DECLINED" | "WAITLIST";
export type PaymentStatus = "PENDING" | "PAID" | "EXEMPT";
export type MatchStatus = "SCHEDULED" | "LIVE" | "FINISHED" | "CANCELED";

export interface User {
  id: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  email: string;
}

export interface ClubRef {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  role: Role;
  memberId: string;
  permissions: Permission[];
}

export interface Club {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  pixKey?: string | null;
  pixName?: string | null;
  me: { memberId: string; role: Role; permissions: Permission[] };
  totals: { members: number; matches: number; goals: number };
}

export interface Member {
  id: string;
  name: string;
  nickname: string | null;
  phone?: string | null;
  role: Role;
  position: string | null;
  isGoalkeeper: boolean;
  skill?: number;
  hasAccount: boolean;
  goals: number;
  assists: number;
}

export interface MatchSummary {
  id: string;
  title: string;
  startsAt: string;
  durationMin: number;
  location: string;
  maxPlayers: number;
  priceCents: number;
  status: MatchStatus;
  confirmedCount: number;
  waitlistCount: number;
  pendingPayments: number;
  myStatus: Attendance;
  myPayment: PaymentStatus | null;
  score: { A: number; B: number };
}

export interface Person {
  participantId: string | null;
  memberId: string;
  name: string;
  nickname: string | null;
  position: string | null;
  isGoalkeeper: boolean;
  status: Attendance;
  paymentStatus: PaymentStatus | null;
  team: "A" | "B" | null;
}

export interface MatchEvent {
  id: string;
  type: "GOAL";
  team: "A" | "B";
  second: number;
  scorerId: string | null;
  scorer: string | null;
  assistId: string | null;
  assist: string | null;
}

export interface Timer {
  elapsedSec: number;
  running: boolean;
  period: number;
  serverTime: string;
}

export interface MatchDetail {
  id: string;
  clubId: string;
  clubName: string;
  title: string;
  startsAt: string;
  durationMin: number;
  location: string;
  maxPlayers: number;
  priceCents: number;
  notes: string | null;
  status: MatchStatus;
  timer: Timer;
  score: { A: number; B: number };
  events: MatchEvent[];
  people: Person[];
  counts: { confirmed: number; waitlist: number; declined: number; pending: number; paid: number };
  finance: { receivedCents: number; pendingCents: number } | null;
  me: {
    memberId: string;
    participantId: string | null;
    status: Attendance;
    paymentStatus: PaymentStatus | null;
    team: "A" | "B" | null;
    role: Role;
    permissions: Permission[];
  };
  canManage: boolean;
}

export interface Activity {
  type: "payment" | "confirmation";
  at: string;
  title: string;
  detail: string;
}
