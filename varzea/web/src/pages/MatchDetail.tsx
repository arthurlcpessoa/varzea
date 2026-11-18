import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Avatar, Empty, ErrorBox, FormError, Loading, Sheet, useToast } from "../components/ui";
import { get, post, put } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ATTENDANCE_LABEL, brl, day, duration, monthShort, POSITION_LABEL, relative, time, weekdayShort } from "../lib/format";
import { useAction, useLoad } from "../lib/hooks";
import type { MatchDetail, Person } from "../lib/types";

type Tab = "jogadores" | "times" | "pagamento" | "mural";

export function MatchDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("aba") as Tab) ?? "jogadores";
  const setTab = (t: Tab) => setParams({ aba: t }, { replace: true });
  const toast = useToast();
  const action = useAction();
  const { data: m, setData, error, loading, reload } = useLoad(() => get<MatchDetail>(`/matches/${id}`), [id]);

  const close = () => navigate("/partidas");

  if (loading && !m) {
    return (
      <Sheet title="Detalhes da partida" onClose={close}>
        <Loading />
      </Sheet>
    );
  }
  if (error || !m) {
    return (
      <Sheet title="Detalhes da partida" onClose={close}>
        <ErrorBox message={error ?? "Partida não encontrada."} onRetry={reload} />
      </Sheet>
    );
  }

  const act = (fn: () => Promise<MatchDetail>, ok?: string) =>
    action.run(async () => {
      const res = await fn();
      setData(res);
      if (ok) toast(ok);
    });

  const open = m.status === "SCHEDULED" || m.status === "LIVE";
  const mine = m.me.status;

  const mainAction = () => {
    if (m.status === "LIVE" || (m.canManage && m.status === "SCHEDULED")) {
      return (
        <button onClick={() => navigate(`/partidas/${m.id}/ao-vivo`)}>
          <Icon name="play" /> {m.status === "LIVE" ? "Acompanhar ao vivo" : "Iniciar partida"}
        </button>
      );
    }
    return null;
  };

  return (
    <Sheet title="Detalhes da partida" onClose={close} action={mainAction()}>
      <div className="detail-hero">
        <div className="detail-date">
          <span>{weekdayShort(m.startsAt)}</span>
          <strong>{day(m.startsAt)}</strong>
          <small>{monthShort(m.startsAt)}</small>
        </div>
        <div className="detail-info">
          <span className="confirmed-pill">
            {m.status === "CANCELED"
              ? "PARTIDA CANCELADA"
              : m.status === "FINISHED"
                ? `ENCERRADA · ${m.score.A} × ${m.score.B}`
                : mine === "CONFIRMED"
                  ? "SUA PRESENÇA ESTÁ CONFIRMADA"
                  : mine === "WAITLIST"
                    ? "VOCÊ ESTÁ NA LISTA DE ESPERA"
                    : mine === "DECLINED"
                      ? "VOCÊ AVISOU QUE NÃO VAI"
                      : "CONFIRME SUA PRESENÇA"}
          </span>
          <h2>{m.title}</h2>
          <p>
            <Icon name="clock" size={15} />
            {time(m.startsAt)} · {duration(m.durationMin)}
          </p>
          <p>
            <Icon name="pin" size={15} />
            {m.location}
          </p>
          {m.priceCents > 0 && (
            <p>
              <Icon name="wallet" size={15} />
              {brl(m.priceCents)} por jogador
            </p>
          )}
          {m.notes && <p className="notes">{m.notes}</p>}
        </div>
      </div>

      {open && m.status === "SCHEDULED" && (
        <div className="rsvp-bar">
          {mine === "CONFIRMED" || mine === "WAITLIST" ? (
            <button className="ghost-dark" disabled={action.busy} onClick={() => act(() => post(`/matches/${m.id}/attendance`, { status: "DECLINED" }), "Ausência registrada.")}>
              Não vou mais
            </button>
          ) : (
            <>
              <button className="primary" disabled={action.busy} onClick={() => act(() => post(`/matches/${m.id}/attendance`, { status: "CONFIRMED" }), "Presença registrada!")}>
                <Icon name="check" size={18} /> Vou jogar
              </button>
              {mine !== "DECLINED" && (
                <button className="ghost-dark" disabled={action.busy} onClick={() => act(() => post(`/matches/${m.id}/attendance`, { status: "DECLINED" }), "Ausência registrada.")}>
                  Não vou
                </button>
              )}
            </>
          )}
        </div>
      )}
      {action.error && <p className="form-error pad">{action.error}</p>}

      {m.canManage && open && (
        <div className="manage-row">
          <button onClick={() => navigate(`/partidas/${m.id}/editar`)}>
            <Icon name="edit" size={16} /> Editar
          </button>
          <button onClick={() => action.run(async () => {
            const r = await post<{ sent: number }>(`/matches/${m.id}/broadcast`, { kind: "invite" });
            toast(`Convite enviado pela VarzIA para ${r.sent} jogadores.`);
          })}>
            <Icon name="whatsapp" size={16} /> Convocar
          </button>
          {m.status === "SCHEDULED" && (
            <button className="danger" onClick={() => {
              if (confirm("Cancelar esta partida? Os jogadores verão a partida como cancelada.")) {
                void act(() => post(`/matches/${m.id}/cancel`), "Partida cancelada.");
              }
            }}>
              <Icon name="close" size={16} /> Cancelar
            </button>
          )}
        </div>
      )}

      <div className="detail-tabs four">
        {(
          [
            ["jogadores", "Jogadores"],
            ["times", "Times"],
            ["pagamento", m.finance ? "Pagamentos" : "Pagamento"],
            ["mural", "Mural"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? "active" : ""}>
            {label}
          </button>
        ))}
      </div>

      {tab === "jogadores" && <PlayersTab m={m} act={act} />}
      {tab === "times" && <TeamsTab m={m} act={act} busy={action.busy} />}
      {tab === "pagamento" && (m.finance ? <PaymentsAdminTab m={m} act={act} /> : <MyPaymentTab m={m} />)}
      {tab === "mural" && <WallTab matchId={m.id} />}
    </Sheet>
  );
}

type Act = (fn: () => Promise<MatchDetail>, ok?: string) => Promise<unknown>;

const displayName = (p: Person) => p.nickname ?? p.name;

function PlayersTab({ m, act }: { m: MatchDetail; act: Act }) {
  const [editing, setEditing] = useState(false);
  const groups: [string, Person[]][] = [
    ["Confirmados", m.people.filter((p) => p.status === "CONFIRMED")],
    ["Lista de espera", m.people.filter((p) => p.status === "WAITLIST")],
    ["Sem resposta", m.people.filter((p) => p.status === "PENDING")],
    ["Não vão", m.people.filter((p) => p.status === "DECLINED")],
  ];
  const canEdit = m.canManage && m.status === "SCHEDULED";

  return (
    <>
      <div className="list-summary">
        <div>
          <b>{m.counts.confirmed} confirmados</b>
          <span>de {m.maxPlayers} vagas</span>
        </div>
        <div className="small-progress">
          <i style={{ width: `${Math.min(100, (m.counts.confirmed / m.maxPlayers) * 100)}%` }} />
        </div>
        {canEdit && (
          <button className="link" onClick={() => setEditing(!editing)}>
            {editing ? "Concluir" : "Gerenciar presença"}
          </button>
        )}
      </div>
      <div className="player-list">
        {groups.map(([label, list]) =>
          list.length === 0 ? null : (
            <div key={label} className="group">
              <h4>
                {label} <small>{list.length}</small>
              </h4>
              {list.map((p, i) => (
                <div key={p.memberId} className="row">
                  <Avatar name={p.name} index={i} />
                  <div>
                    <b>
                      {displayName(p)}
                      {p.memberId === m.me.memberId && <small className="you"> (você)</small>}
                    </b>
                    <small>{p.isGoalkeeper ? "Goleiro" : p.position ? POSITION_LABEL[p.position] : "Jogador"}</small>
                  </div>
                  {editing ? (
                    <select
                      value={p.status === "WAITLIST" ? "CONFIRMED" : p.status}
                      onChange={(e) => act(() => put(`/matches/${m.id}/attendance/${p.memberId}`, { status: e.target.value }))}
                      aria-label={`Presença de ${displayName(p)}`}
                    >
                      <option value="CONFIRMED">Confirmado</option>
                      <option value="PENDING">Sem resposta</option>
                      <option value="DECLINED">Não vai</option>
                    </select>
                  ) : p.status === "CONFIRMED" && m.priceCents > 0 ? (
                    <em className={p.paymentStatus === "PAID" || p.paymentStatus === "EXEMPT" ? "paid-label" : ""}>
                      {p.paymentStatus === "PAID" ? "Pago" : p.paymentStatus === "EXEMPT" ? "Isento" : "Pendente"}
                    </em>
                  ) : (
                    <em className="neutral">{ATTENDANCE_LABEL[p.status]}</em>
                  )}
                </div>
              ))}
            </div>
          ),
        )}
      </div>
    </>
  );
}

function TeamsTab({ m, act, busy }: { m: MatchDetail; act: Act; busy: boolean }) {
  const confirmed = m.people.filter((p) => p.status === "CONFIRMED");
  const team = (t: "A" | "B" | null) => confirmed.filter((p) => p.team === t);
  const hasTeams = confirmed.some((p) => p.team);
  const canEdit = m.canManage && m.status !== "FINISHED" && m.status !== "CANCELED";

  if (!hasTeams) {
    return (
      <div className="teams">
        <Empty
          icon="users"
          title="Times ainda não sorteados"
          text={
            canEdit
              ? `${confirmed.length} confirmados. O sorteio separa goleiros, equilibra posições e nível técnico.`
              : "Assim que a organização sortear, os times aparecem aqui."
          }
        />
        {canEdit && (
          <button disabled={busy || confirmed.length < 2} onClick={() => act(() => post(`/matches/${m.id}/teams/draw`), "Times sorteados!")}>
            <Icon name="spark" /> Sortear times
          </button>
        )}
      </div>
    );
  }

  const block = (t: "A" | "B", label: string) => (
    <div>
      <span>{label}</span>
      <strong>{team(t).length} jogadores</strong>
      {team(t).map((p) => (
        <div className="team-player" key={p.memberId}>
          <p>
            {displayName(p)}
            {p.isGoalkeeper && <em> · GK</em>}
          </p>
          {canEdit && (
            <button onClick={() => act(() => put(`/matches/${m.id}/teams/${p.memberId}`, { team: t === "A" ? "B" : "A" }))} aria-label={`Mover ${displayName(p)} de time`}>
              <Icon name="refresh" size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );

  const bench = team(null);
  return (
    <div className="teams">
      {block("A", "TIME VERDE")}
      {block("B", "TIME PRETO")}
      {bench.length > 0 && (
        <div className="bench">
          <span>SEM TIME</span>
          {bench.map((p) => (
            <div className="team-player" key={p.memberId}>
              <p>{displayName(p)}</p>
              {canEdit && (
                <span className="bench-actions">
                  <button onClick={() => act(() => put(`/matches/${m.id}/teams/${p.memberId}`, { team: "A" }))}>Verde</button>
                  <button onClick={() => act(() => put(`/matches/${m.id}/teams/${p.memberId}`, { team: "B" }))}>Preto</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <button disabled={busy} onClick={() => act(() => post(`/matches/${m.id}/teams/draw`), "Times sorteados novamente!")}>
          <Icon name="spark" /> Sortear times novamente
        </button>
      )}
    </div>
  );
}

function MyPaymentTab({ m }: { m: MatchDetail }) {
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [charge, setCharge] = useState<{ copyPaste: string; amountCents: number } | null>(null);

  if (m.priceCents === 0) return <Empty icon="wallet" title="Partida gratuita" text="Não há cobrança para esta partida." />;
  if (m.me.status !== "CONFIRMED") {
    return <Empty icon="wallet" title="Confirme sua presença" text="O pagamento é liberado para quem confirmou presença." />;
  }
  if (m.me.paymentStatus === "PAID" || m.me.paymentStatus === "EXEMPT") {
    return (
      <Empty icon="check" title={m.me.paymentStatus === "PAID" ? "Pagamento confirmado" : "Você está isento"} text="Tudo certo para entrar em campo. 💚" />
    );
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Código Pix copiado!");
    } catch {
      toast("Não foi possível copiar. Selecione o texto e copie manualmente.", "error");
    }
  };

  return (
    <div className="pix-box">
      <span className="eyebrow">PAGAMENTO VIA PIX</span>
      <h3>{brl(m.priceCents)}</h3>
      <p>Gere o Pix copia e cola, pague no app do seu banco e aguarde a confirmação da organização.</p>
      {charge ? (
        <>
          <textarea readOnly value={charge.copyPaste} rows={4} onFocus={(e) => e.currentTarget.select()} />
          <button className="primary" onClick={() => copy(charge.copyPaste)}>
            <Icon name="copy" size={18} /> Copiar código Pix
          </button>
        </>
      ) : (
        <button className="primary" disabled={busy} onClick={() => run(async () => setCharge(await post(`/matches/${m.id}/payment/charge`)))}>
          Gerar Pix copia e cola
        </button>
      )}
      <FormError message={error} />
    </div>
  );
}

function PaymentsAdminTab({ m, act }: { m: MatchDetail; act: Act }) {
  const toast = useToast();
  const { run, busy } = useAction();
  const confirmed = m.people.filter((p) => p.status === "CONFIRMED");
  const pending = confirmed.filter((p) => p.paymentStatus === "PENDING");

  if (m.priceCents === 0) return <Empty icon="wallet" title="Partida gratuita" text="Não há cobrança para esta partida." />;

  return (
    <div className="payment-summary">
      <div>
        <Icon name="wallet" />
        <p>
          <span>Recebido</span>
          <strong>{brl(m.finance!.receivedCents)}</strong>
        </p>
      </div>
      <div>
        <Icon name="clock" />
        <p>
          <span>Pendente</span>
          <strong>{brl(m.finance!.pendingCents)}</strong>
        </p>
      </div>
      <h3>
        {pending.length === 0
          ? "Todos os confirmados pagaram 🎉"
          : `${pending.length} pagamento${pending.length > 1 ? "s" : ""} aguardando confirmação`}
      </h3>
      <div className="pay-list">
        {confirmed.map((p, i) => (
          <div key={p.memberId} className="row">
            <Avatar name={p.name} index={i} />
            <b>{displayName(p)}</b>
            {p.paymentStatus === "PENDING" ? (
              <span className="pay-actions">
                <button className="ok" onClick={() => act(() => post(`/matches/${m.id}/payments/${p.participantId}/confirm`), `Pagamento de ${displayName(p)} confirmado.`)}>
                  Confirmar
                </button>
                <button onClick={() => act(() => post(`/matches/${m.id}/payments/${p.participantId}/exempt`))}>Isentar</button>
              </span>
            ) : (
              <span className="pay-actions">
                <em className="paid-label">{p.paymentStatus === "PAID" ? "Pago" : "Isento"}</em>
                <button className="undo" aria-label="Desfazer" onClick={() => act(() => post(`/matches/${m.id}/payments/${p.participantId}/revert`))}>
                  <Icon name="refresh" size={13} />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
      {pending.length > 0 && (
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await post<{ sent: number }>(`/matches/${m.id}/broadcast`, { kind: "payment" });
              toast(`Lembrete enviado para ${r.sent} jogador${r.sent === 1 ? "" : "es"}.`);
            })
          }
        >
          <Icon name="whatsapp" size={16} /> Cobrar pendentes pela VarzIA
        </button>
      )}
    </div>
  );
}

interface WallItem {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; nickname: string | null };
}

function WallTab({ matchId }: { matchId: string }) {
  const { user } = useAuth();
  const { data, setData, error, reload } = useLoad(() => get<WallItem[]>(`/matches/${matchId}/wall`), [matchId]);
  const { busy, error: sendError, run } = useAction();
  const [text, setText] = useState("");

  useEffect(() => {
    const t = setInterval(() => void reload(), 15000);
    return () => clearInterval(t);
  }, [reload]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void run(async () => {
      const item = await post<WallItem>(`/matches/${matchId}/wall`, { body: text });
      setData([...(data ?? []), item]);
      setText("");
    });
  };

  return (
    <div className="wall">
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data?.length === 0 && <Empty icon="message" title="Mural da partida" text="Combine carona, colete, quem leva a bola…" />}
      {data?.map((w) => (
        <div key={w.id} className={`bubble ${w.author.id === user?.id ? "mine" : ""}`}>
          <b>{w.author.nickname ?? w.author.name}</b>
          <p>{w.body}</p>
          <small>{relative(w.createdAt)}</small>
        </div>
      ))}
      <form className="wall-form" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma mensagem…" maxLength={500} />
        <button disabled={busy || !text.trim()} aria-label="Enviar">
          <Icon name="send" size={18} />
        </button>
      </form>
      <FormError message={sendError} />
    </div>
  );
}
