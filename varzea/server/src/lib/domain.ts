// Vocabulário do domínio e matriz de permissões (RN05, RF14, RF15).

export const ROLES = ["DIRETORIA", "COMISSAO", "JOGADOR"] as const;
export type Role = (typeof ROLES)[number];

export const POSITIONS = ["GOLEIRO", "DEFESA", "MEIO", "ATAQUE"] as const;
export type Position = (typeof POSITIONS)[number];

export const MATCH_STATUS = ["SCHEDULED", "LIVE", "FINISHED", "CANCELED"] as const;
export type MatchStatus = (typeof MATCH_STATUS)[number];

export const ATTENDANCE = ["CONFIRMED", "PENDING", "DECLINED", "WAITLIST"] as const;
export type Attendance = (typeof ATTENDANCE)[number];

export const PAYMENT_STATUS = ["PENDING", "PAID", "EXEMPT"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

export const TEAMS = ["A", "B"] as const;
export type Team = (typeof TEAMS)[number];

/**
 * Ações controladas por permissão. Decisão inicial para o ponto pendente nº 3
 * da documentação: a comissão técnica gerencia partidas, presença, pagamentos,
 * times e o bot, e pode editar dados de jogadores; apenas a diretoria altera o
 * clube, atribui funções e remove participantes.
 */
export const PERMISSIONS = {
  "club.update": ["DIRETORIA"],
  "members.add": ["DIRETORIA", "COMISSAO"],
  "members.edit": ["DIRETORIA", "COMISSAO"],
  "members.remove": ["DIRETORIA"],
  "members.assignRole": ["DIRETORIA"],
  "invites.create": ["DIRETORIA", "COMISSAO"],
  "matches.manage": ["DIRETORIA", "COMISSAO"],
  "payments.manage": ["DIRETORIA", "COMISSAO"],
  "bot.configure": ["DIRETORIA", "COMISSAO"],
  "announcements.post": ["DIRETORIA", "COMISSAO"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: string, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

export function permissionsFor(role: string): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}
