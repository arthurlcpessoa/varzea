import type { Match, MatchEvent, MatchParticipant } from "@prisma/client";

/** Tempo de jogo em segundos, considerando se o cronômetro está rodando. */
export function elapsedSeconds(m: Pick<Match, "elapsedSec" | "runningSince">, now = new Date()): number {
  const running = m.runningSince ? Math.floor((now.getTime() - m.runningSince.getTime()) / 1000) : 0;
  return m.elapsedSec + Math.max(0, running);
}

export function score(events: Pick<MatchEvent, "type" | "team">[]) {
  return {
    A: events.filter((e) => e.type === "GOAL" && e.team === "A").length,
    B: events.filter((e) => e.type === "GOAL" && e.team === "B").length,
  };
}

export function serializeMatchSummary(
  m: Match & { participants: MatchParticipant[]; events: MatchEvent[] },
  viewerMemberId: string,
) {
  const mine = m.participants.find((p) => p.memberId === viewerMemberId);
  const confirmed = m.participants.filter((p) => p.status === "CONFIRMED");
  return {
    id: m.id,
    clubId: m.clubId,
    title: m.title,
    startsAt: m.startsAt,
    durationMin: m.durationMin,
    location: m.location,
    maxPlayers: m.maxPlayers,
    priceCents: m.priceCents,
    status: m.status,
    confirmedCount: confirmed.length,
    waitlistCount: m.participants.filter((p) => p.status === "WAITLIST").length,
    pendingPayments: confirmed.filter((p) => p.paymentStatus === "PENDING").length,
    myStatus: mine?.status ?? "PENDING",
    myPayment: mine?.paymentStatus ?? null,
    score: score(m.events),
  };
}
