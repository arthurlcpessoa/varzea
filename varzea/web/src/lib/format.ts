const TZ = undefined; // usa o fuso do navegador

export const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const weekdayShort = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", timeZone: TZ }).replace(".", "").toUpperCase().slice(0, 3);

export const monthShort = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { month: "short", timeZone: TZ }).replace(".", "").toUpperCase().slice(0, 3);

export const monthLong = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { month: "long", timeZone: TZ }).toUpperCase();

export const day = (iso: string) => String(new Date(iso).getDate()).padStart(2, "0");

export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

export const todayLabel = () =>
  new Date()
    .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ })
    .toUpperCase();

export const duration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m}min`;
};

export const clock = (sec: number) =>
  `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

export const minute = (sec: number) => `${String(Math.floor(sec / 60) + 1).padStart(2, "0")}'`;

export function relative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export const ROLE_LABEL: Record<string, string> = {
  DIRETORIA: "Diretoria",
  COMISSAO: "Comissão técnica",
  JOGADOR: "Jogador",
};

export const POSITION_LABEL: Record<string, string> = {
  GOLEIRO: "Goleiro",
  DEFESA: "Defesa",
  MEIO: "Meio-campo",
  ATAQUE: "Ataque",
};

export const ATTENDANCE_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmado",
  PENDING: "Sem resposta",
  DECLINED: "Não vai",
  WAITLIST: "Lista de espera",
};

/** Valor para <input type="datetime-local"> a partir de uma data. */
export function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
