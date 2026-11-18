// Sorteio equilibrado dos times (RN13, RF33-RF36).
//
// Critérios (decisão inicial para o ponto pendente nº 7):
//  1. Goleiros são separados primeiro, um para cada lado.
//  2. Os demais são agrupados por posição (defesa, meio, ataque, sem posição),
//     para que cada time receba uma distribuição parecida de funções.
//  3. Dentro de cada grupo, em ordem de nível técnico (com desempate aleatório),
//     cada jogador vai para o time com menor soma de nível — respeitando que a
//     diferença de tamanho entre os times nunca passe de 1.

import type { Team } from "../lib/domain.js";

export interface DrawPlayer {
  id: string;
  skill: number;
  position?: string | null;
  isGoalkeeper?: boolean;
}

export interface DrawResult {
  A: string[];
  B: string[];
  skillA: number;
  skillB: number;
}

const POSITION_ORDER = ["DEFESA", "MEIO", "ATAQUE", ""];

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function drawTeams(players: DrawPlayer[], random: () => number = Math.random): DrawResult {
  const teams: Record<Team, DrawPlayer[]> = { A: [], B: [] };
  const sum = (t: Team) => teams[t].reduce((acc, p) => acc + p.skill, 0);
  const total = players.length;
  const maxSize = Math.ceil(total / 2);

  const pick = (): Team => {
    if (teams.A.length >= maxSize) return "B";
    if (teams.B.length >= maxSize) return "A";
    const diff = sum("A") - sum("B");
    if (diff !== 0) return diff < 0 ? "A" : "B";
    if (teams.A.length !== teams.B.length) return teams.A.length < teams.B.length ? "A" : "B";
    return random() < 0.5 ? "A" : "B";
  };

  const isGk = (p: DrawPlayer) => p.isGoalkeeper || p.position === "GOLEIRO";
  const keepers = shuffle(players.filter(isGk), random).sort((a, b) => b.skill - a.skill);
  const others = players.filter((p) => !isGk(p));

  // Goleiros: alterna para garantir um em cada time quando houver dois ou mais.
  keepers.forEach((gk, i) => {
    const target: Team = i % 2 === 0 ? (sum("A") <= sum("B") ? "A" : "B") : teams.A.length > teams.B.length ? "B" : "A";
    const t = teams[target].length >= maxSize ? (target === "A" ? "B" : "A") : target;
    teams[t].push(gk);
  });

  const groups = new Map<string, DrawPlayer[]>();
  for (const p of others) {
    const key = POSITION_ORDER.includes(p.position ?? "") ? (p.position ?? "") : "";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  for (const key of POSITION_ORDER) {
    const group = shuffle(groups.get(key) ?? [], random).sort((a, b) => b.skill - a.skill);
    for (const p of group) teams[pick()].push(p);
  }

  return {
    A: teams.A.map((p) => p.id),
    B: teams.B.map((p) => p.id),
    skillA: sum("A"),
    skillB: sum("B"),
  };
}
