import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { NoClubCard } from "../components/Onboarding";
import { Avatar, Empty, ErrorBox, Field, FormError, Loading, PageHeader, Sheet, useToast } from "../components/ui";
import { del, get, patch, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { brl, day, monthShort, POSITION_LABEL, relative, ROLE_LABEL } from "../lib/format";
import { useAction, useLoad } from "../lib/hooks";
import type { Club, Member, Role } from "../lib/types";

type Tab = "visao" | "elenco" | "estatisticas";

export function ClubPage() {
  const { club } = useAuth();
  if (!club) {
    return (
      <section className="page-section club-page">
        <Empty icon="shield" title="Você ainda não tem um clube" text="Aqui vão aparecer o elenco, as estatísticas e os avisos do seu time." />
        <NoClubCard eyebrow="SEU PRIMEIRO CLUBE" title="Crie o clube da sua pelada" />
      </section>
    );
  }
  return <ClubView />;
}

function ClubView() {
  const { club: ref, can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("aba") as Tab) ?? "visao";
  const clubId = ref!.id;
  const club = useLoad(() => get<Club>(`/clubs/${clubId}`), [clubId]);

  if (club.loading && !club.data) return <Loading />;
  if (club.error || !club.data) return <ErrorBox message={club.error ?? "Clube não encontrado."} onRetry={club.reload} />;
  const c = club.data;

  return (
    <section className="page-section club-page">
      <div className="club-hero">
        <div className="crest">{c.name[0]}</div>
        <div>
          <h2>{c.name}</h2>
          <p>{[c.city, c.state].filter(Boolean).join(", ") || "Local não informado"}</p>
          <span>{ROLE_LABEL[c.me.role]}</span>
        </div>
        {can("club.update") && (
          <button onClick={() => navigate("/clube/configuracoes")} aria-label="Configurações do clube">
            <Icon name="gear" size={19} />
          </button>
        )}
      </div>
      <div className="club-tabs">
        {(
          [
            ["visao", "Visão geral"],
            ["elenco", "Elenco"],
            ["estatisticas", "Estatísticas"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setParams({ aba: t }, { replace: true })}>
            {label}
          </button>
        ))}
      </div>
      {tab === "visao" && <Overview c={c} />}
      {tab === "elenco" && <Roster clubId={clubId} />}
      {tab === "estatisticas" && <Stats clubId={clubId} />}
    </section>
  );
}

function Overview({ c }: { c: Club }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [inviting, setInviting] = useState(() => params.get("convidar") === "1" && can("invites.create"));

  const items: { icon: IconName; title: string; sub: string; to?: string; onClick?: () => void; show: boolean; online?: boolean }[] = [
    { icon: "users", title: "Jogadores e permissões", sub: `${c.totals.members} membros cadastrados`, onClick: () => navigate("/clube?aba=elenco"), show: true },
    { icon: "plus", title: "Convidar jogadores", sub: "Gere um link ou código de convite", onClick: () => setInviting(true), show: can("invites.create") },
    { icon: "wallet", title: "Financeiro", sub: "Recebidos, pendências e histórico", to: "/clube/financeiro", show: can("payments.manage") },
    { icon: "whatsapp", title: "VarzIA no WhatsApp", sub: "Configurar e testar o assistente", to: "/clube/bot", show: true, online: true },
  ];

  return (
    <>
      <div className="stats-row">
        <div>
          <Icon name="ball" />
          <strong>{c.totals.matches}</strong>
          <span>Partidas</span>
        </div>
        <div>
          <Icon name="users" />
          <strong>{c.totals.members}</strong>
          <span>Jogadores</span>
        </div>
        <div>
          <Icon name="trophy" />
          <strong>{c.totals.goals}</strong>
          <span>Gols</span>
        </div>
      </div>
      <h3 className="block-title">Gestão do clube</h3>
      <div className="management">
        {items
          .filter((i) => i.show)
          .map((i) => (
            <button key={i.title} onClick={i.onClick ?? (() => navigate(i.to!))}>
              <i>
                <Icon name={i.icon} />
              </i>
              <div>
                <b>{i.title}</b>
                <span className={i.online ? "online" : ""}>{i.sub}</span>
              </div>
              <Icon name="chevron" />
            </button>
          ))}
      </div>
      <Announcements clubId={c.id} />
      {inviting && <InviteSheet clubId={c.id} onClose={() => setInviting(false)} />}
    </>
  );
}

interface Announcement {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string; nickname: string | null };
}

function Announcements({ clubId }: { clubId: string }) {
  const { can } = useAuth();
  const list = useLoad(() => get<Announcement[]>(`/clubs/${clubId}/announcements`), [clubId]);
  const { busy, error, run } = useAction();
  const [text, setText] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await post(`/clubs/${clubId}/announcements`, { body: text });
      setText("");
      await list.reload();
    });
  };

  return (
    <>
      <h3 className="block-title">Avisos</h3>
      {can("announcements.post") && (
        <form className="wall-form standalone" onSubmit={submit}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Publicar um aviso para o clube…" maxLength={1000} />
          <button disabled={busy || !text.trim()} aria-label="Publicar">
            <Icon name="send" size={18} />
          </button>
        </form>
      )}
      <FormError message={error} />
      {list.data?.length === 0 && <p className="muted pad-y">Nenhum aviso publicado.</p>}
      {list.data?.map((a) => (
        <div key={a.id} className="notice-card">
          <p>{a.body}</p>
          <small>
            {a.author.nickname ?? a.author.name} · {relative(a.createdAt)}
          </small>
        </div>
      ))}
    </>
  );
}

function InviteSheet({ clubId, onClose }: { clubId: string; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [role, setRole] = useState<Role>("JOGADOR");
  const [invite, setInvite] = useState<{ code: string; url: string; expiresAt: string } | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copiado!");
    } catch {
      toast("Não foi possível copiar.", "error");
    }
  };

  return (
    <Sheet title="Convidar" onClose={onClose}>
      <div className="form">
        <p className="muted">O convite vale por 7 dias. Quem abrir o link cria a conta e já entra no clube.</p>
        {can("members.assignRole") && (
          <Field label="Função de quem entrar">
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="JOGADOR">Jogador</option>
              <option value="COMISSAO">Comissão técnica</option>
              <option value="DIRETORIA">Diretoria</option>
            </select>
          </Field>
        )}
        {invite ? (
          <div className="invite-box">
            <span>CÓDIGO</span>
            <strong>{invite.code}</strong>
            <button className="primary" onClick={() => copy(invite.url)}>
              <Icon name="copy" size={18} /> Copiar link de convite
            </button>
            <a
              className="whatsapp-share"
              href={`https://wa.me/?text=${encodeURIComponent(`Bora jogar com a gente no Várzea! Entre pelo link: ${invite.url}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="whatsapp" size={18} /> Enviar no WhatsApp
            </a>
          </div>
        ) : (
          <button className="primary" disabled={busy} onClick={() => run(async () => setInvite(await post(`/clubs/${clubId}/invites`, { role })))}>
            Gerar convite
          </button>
        )}
        <FormError message={error} />
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Elenco

function Roster({ clubId }: { clubId: string }) {
  const { can, club } = useAuth();
  const list = useLoad(() => get<Member[]>(`/clubs/${clubId}/members`), [clubId]);
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [inviting, setInviting] = useState(false);
  const [query, setQuery] = useState("");

  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorBox message={list.error} onRetry={list.reload} />;

  const q = query.toLowerCase();
  const members = (list.data ?? []).filter(
    (m) => !q || m.name.toLowerCase().includes(q) || (m.nickname ?? "").toLowerCase().includes(q),
  );

  return (
    <>
      <div className="roster-tools">
        <input className="search" placeholder="Buscar jogador" value={query} onChange={(e) => setQuery(e.target.value)} />
        {can("members.add") && (
          <button className="pill-button" onClick={() => setEditing("new")}>
            <Icon name="plus" size={16} /> Adicionar
          </button>
        )}
        {can("invites.create") && (
          <button className="pill-button ghost" onClick={() => setInviting(true)} aria-label="Convidar">
            <Icon name="send" size={16} />
          </button>
        )}
      </div>
      <div className="roster">
        {members.map((m, i) => {
          const clickable = can("members.edit") || m.id === club?.memberId;
          return (
            <div key={m.id} className={clickable ? "clickable" : ""} onClick={clickable ? () => setEditing(m) : undefined}>
              <Avatar name={m.name} index={i} />
              <div>
                <b>
                  {m.nickname ?? m.name}
                  {m.id === club?.memberId && <small className="you"> (você)</small>}
                </b>
                <small>
                  {m.isGoalkeeper ? "Goleiro" : m.position ? POSITION_LABEL[m.position] : "Sem posição"}
                  {m.goals > 0 && ` · ${m.goals} gol${m.goals > 1 ? "s" : ""}`}
                  {!m.hasAccount && " · sem conta"}
                </small>
              </div>
              <em className={m.role === "JOGADOR" ? "neutral" : "paid-label"}>{ROLE_LABEL[m.role]}</em>
            </div>
          );
        })}
        {members.length === 0 && <Empty icon="users" title="Ninguém encontrado" text="Tente outro nome." />}
      </div>
      {editing && (
        <MemberSheet
          clubId={clubId}
          member={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void list.reload();
          }}
        />
      )}
      {inviting && <InviteSheet clubId={clubId} onClose={() => setInviting(false)} />}
    </>
  );
}

function MemberSheet({
  clubId,
  member,
  onClose,
  onSaved,
}: {
  clubId: string;
  member: Member | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { can, club, refresh } = useAuth();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const isSelf = member?.id === club?.memberId;
  const manager = can("members.edit");
  const [form, setForm] = useState({
    name: member?.name ?? "",
    nickname: member?.nickname ?? "",
    phone: member?.phone ?? "",
    position: member?.position ?? "",
    skill: member?.skill ?? 3,
    role: member?.role ?? "JOGADOR",
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const body: Record<string, unknown> = {
        nickname: form.nickname || null,
        phone: form.phone || null,
        position: form.position || null,
      };
      if (manager) {
        body.name = form.name;
        body.skill = Number(form.skill);
      }
      if (can("members.assignRole") && (!member || form.role !== member.role)) body.role = form.role;
      if (member) await patch(`/clubs/${clubId}/members/${member.id}`, body);
      else await post(`/clubs/${clubId}/members`, body);
      if (isSelf) await refresh();
      toast(member ? "Dados atualizados." : "Jogador adicionado!");
      onSaved();
    });
  };

  const remove = () => {
    if (!member || !confirm(`Remover ${member.nickname ?? member.name} do clube? A conta dele continua existindo.`)) return;
    void run(async () => {
      await del(`/clubs/${clubId}/members/${member.id}`);
      toast("Jogador removido do clube.");
      onSaved();
    });
  };

  return (
    <Sheet title={member ? "Jogador" : "Novo jogador"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nome completo">
          <input required minLength={2} disabled={!manager} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="form-row">
          <Field label="Apelido">
            <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
          </Field>
          <Field label="Telefone (WhatsApp)">
            <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(81) 99999-9999" />
          </Field>
        </div>
        <Field label="Posição">
          <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>
            <option value="">Sem posição definida</option>
            {Object.entries(POSITION_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {manager && (
          <Field label={`Nível técnico: ${form.skill}`} hint="Usado só para equilibrar o sorteio. Os jogadores não veem.">
            <input type="range" min={1} max={5} value={form.skill} onChange={(e) => setForm({ ...form, skill: Number(e.target.value) })} />
          </Field>
        )}
        {can("members.assignRole") && (
          <Field label="Função no clube">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="JOGADOR">Jogador</option>
              <option value="COMISSAO">Comissão técnica</option>
              <option value="DIRETORIA">Diretoria</option>
            </select>
          </Field>
        )}
        <FormError message={error} />
        <button className="primary" disabled={busy}>
          {member ? "Salvar" : "Adicionar jogador"}
        </button>
        {member && can("members.remove") && !isSelf && (
          <button type="button" className="logout" onClick={remove} disabled={busy}>
            Remover do clube
          </button>
        )}
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Estatísticas

interface Stats {
  players: { memberId: string; name: string; goals: number; assists: number; matches: number }[];
  results: { id: string; title: string; startsAt: string; scoreA: number; scoreB: number }[];
}

function Stats({ clubId }: { clubId: string }) {
  const { data, error, loading, reload } = useLoad(() => get<Stats>(`/clubs/${clubId}/stats`), [clubId]);
  const navigate = useNavigate();
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? "Erro"} onRetry={reload} />;
  const ranked = data.players.filter((p) => p.goals + p.assists + p.matches > 0);

  return (
    <>
      <h3 className="block-title">Artilharia</h3>
      {ranked.length === 0 ? (
        <p className="muted">Os números aparecem depois da primeira partida encerrada.</p>
      ) : (
        <table className="stats-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Jogador</th>
              <th title="Gols">G</th>
              <th title="Assistências">A</th>
              <th title="Jogos">J</th>
            </tr>
          </thead>
          <tbody>
            {ranked.slice(0, 15).map((p, i) => (
              <tr key={p.memberId}>
                <td>{i + 1}</td>
                <td>{p.name}</td>
                <td>
                  <b>{p.goals}</b>
                </td>
                <td>{p.assists}</td>
                <td>{p.matches}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 className="block-title">Resultados</h3>
      {data.results.length === 0 && <p className="muted">Nenhuma partida encerrada ainda.</p>}
      {data.results.map((r) => (
        <button key={r.id} className="result-row" onClick={() => navigate(`/partidas/${r.id}`)}>
          <span className="match-date small">
            <strong>{day(r.startsAt)}</strong>
            <span>{monthShort(r.startsAt)}</span>
          </span>
          <b>{r.title}</b>
          <span className="score">
            <i className="dot green" /> {r.scoreA} × {r.scoreB} <i className="dot black" />
          </span>
        </button>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- Configurações do clube

export function ClubSettingsPage() {
  const { club: ref, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const club = useLoad(() => get<Club>(`/clubs/${ref!.id}`), [ref!.id]);
  const { busy, error, run } = useAction();
  const [form, setForm] = useState<Record<string, string> | null>(null);

  if (club.loading && !club.data) return <Loading />;
  if (!club.data) return <ErrorBox message={club.error ?? "Erro"} onRetry={club.reload} />;
  const c = club.data;
  const v = form ?? { name: c.name, city: c.city ?? "", state: c.state ?? "", pixKey: c.pixKey ?? "", pixName: c.pixName ?? "" };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...v, [k]: e.target.value });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await patch(`/clubs/${c.id}`, { ...v, pixKey: v.pixKey || null, pixName: v.pixName || null });
      await refresh();
      toast("Clube atualizado.");
      navigate("/clube");
    });
  };

  return (
    <section className="page-section">
      <PageHeader title="Configurações do clube" back="/clube" />
      <form className="form" onSubmit={submit}>
        <Field label="Nome do clube">
          <input required minLength={2} value={v.name} onChange={set("name")} />
        </Field>
        <div className="form-row">
          <Field label="Cidade">
            <input value={v.city} onChange={set("city")} />
          </Field>
          <Field label="UF">
            <input maxLength={2} value={v.state} onChange={set("state")} />
          </Field>
        </div>
        <h3 className="block-title">Recebimento via Pix</h3>
        <Field label="Chave Pix do clube" hint="CPF, CNPJ, e-mail, telefone (+55…) ou chave aleatória.">
          <input value={v.pixKey} onChange={set("pixKey")} placeholder="resenhafc@email.com" />
        </Field>
        <Field label="Nome do recebedor" hint="Como aparece no app do banco (até 25 letras).">
          <input maxLength={25} value={v.pixName} onChange={set("pixName")} />
        </Field>
        <FormError message={error} />
        <button className="primary" disabled={busy}>
          Salvar
        </button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- Financeiro

interface Finance {
  receivedCents: number;
  pendingCents: number;
  pending: { participantId: string; matchId: string; matchTitle: string; startsAt: string; name: string; amountCents: number }[];
  history: { id: string; status: string; amountCents: number; createdAt: string; verifiedAt: string | null; name: string; matchTitle: string; provider: string }[];
  pixProvider: string;
}

export function FinancePage() {
  const { club } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const action = useAction();
  const { data, error, loading, reload } = useLoad(() => get<Finance>(`/clubs/${club!.id}/finance`), [club!.id]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? "Erro"} onRetry={reload} />;

  return (
    <section className="page-section">
      <PageHeader title="Financeiro" back="/clube" />
      <div className="payment-summary flat">
        <div>
          <Icon name="wallet" />
          <p>
            <span>Recebido</span>
            <strong>{brl(data.receivedCents)}</strong>
          </p>
        </div>
        <div>
          <Icon name="clock" />
          <p>
            <span>Pendente</span>
            <strong>{brl(data.pendingCents)}</strong>
          </p>
        </div>
      </div>
      <p className="muted small-note">
        Conferência Pix: <b>{data.pixProvider === "manual" ? "manual" : data.pixProvider}</b>. Confira o extrato do banco e
        confirme cada pagamento — ou integre um provedor Pix para automatizar.
      </p>

      <h3 className="block-title">Pendências ({data.pending.length})</h3>
      {data.pending.length === 0 && <p className="muted">Nenhum pagamento pendente. 🎉</p>}
      <div className="management">
        {data.pending.map((p) => (
          <div key={p.participantId} className="finance-row">
            <div>
              <b>{p.name}</b>
              <span>
                {p.matchTitle} · {day(p.startsAt)}/{monthShort(p.startsAt)}
              </span>
            </div>
            <strong>{brl(p.amountCents)}</strong>
            <button
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  await post(`/matches/${p.matchId}/payments/${p.participantId}/confirm`);
                  toast(`Pagamento de ${p.name} confirmado.`);
                  await reload();
                })
              }
            >
              Confirmar
            </button>
          </div>
        ))}
      </div>
      <FormError message={action.error} />

      <h3 className="block-title">Histórico</h3>
      {data.history.length === 0 && <p className="muted">Nenhuma movimentação ainda.</p>}
      <div className="history">
        {data.history.map((h) => (
          <div key={h.id}>
            <div>
              <b>{h.name}</b>
              <span>
                {h.matchTitle} · {relative(h.verifiedAt ?? h.createdAt)}
              </span>
            </div>
            <span className={`tag ${h.status === "CONFIRMED" ? "tag-green" : h.status === "PENDING" ? "tag-amber" : "tag-red"}`}>
              {h.status === "CONFIRMED" ? "Pago" : h.status === "PENDING" ? "Pix gerado" : "Estornado"}
            </span>
            <strong>{brl(h.amountCents)}</strong>
          </div>
        ))}
      </div>
      <button className="link center" onClick={() => navigate("/partidas")}>
        Ver partidas
      </button>
    </section>
  );
}
