import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { FirstSteps, NoClubHome } from "../components/Onboarding";
import { Empty, ErrorBox, Loading, useToast } from "../components/ui";
import { get, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { day, duration, monthShort, relative, time, todayLabel } from "../lib/format";
import { useAction, useLoad } from "../lib/hooks";
import type { Activity, MatchSummary } from "../lib/types";

export function HomePage() {
  const { club } = useAuth();
  return club ? <ClubHome /> : <NoClubHome />;
}

function ClubHome() {
  const { user, club, clubs, selectClub, can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const action = useAction();
  const clubId = club!.id;

  const matches = useLoad(async () => {
    const [live, upcoming] = await Promise.all([
      get<MatchSummary[]>(`/clubs/${clubId}/matches?filter=live`),
      get<MatchSummary[]>(`/clubs/${clubId}/matches?filter=upcoming`),
    ]);
    return { live, upcoming };
  }, [clubId]);
  const activity = useLoad(() => get<Activity[]>(`/clubs/${clubId}/activity`), [clubId]);

  const next = matches.data?.live[0] ?? matches.data?.upcoming[0];
  const firstName = user?.nickname ?? user?.name.split(" ")[0];

  const respond = (status: "CONFIRMED" | "DECLINED") =>
    action.run(async () => {
      if (!next) return;
      const res = await post<{ me: { status: string } }>(`/matches/${next.id}/attendance`, { status });
      toast(
        res.me.status === "CONFIRMED"
          ? "Presença confirmada!"
          : res.me.status === "WAITLIST"
            ? "Partida lotada — você está na lista de espera."
            : "Ausência registrada.",
      );
      await matches.reload();
    });

  return (
    <>
      <section className="welcome">
        <p>{todayLabel()}</p>
        <h1>
          Fala, {firstName}! <Icon name="ball" size={21} />
        </h1>
        {clubs.length > 1 ? (
          <label className="club-pill club-select">
            <span>{club!.name[0]}</span>
            <select value={clubId} onChange={(e) => selectClub(e.target.value)} aria-label="Trocar de clube">
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Icon name="chevron" size={15} />
          </label>
        ) : (
          <Link to="/clube" className="club-pill">
            <span>{club!.name[0]}</span> {club!.name} <Icon name="chevron" size={15} />
          </Link>
        )}
      </section>

      {matches.loading && !matches.data ? (
        <Loading />
      ) : matches.error ? (
        <ErrorBox message={matches.error} onRetry={matches.reload} />
      ) : next ? (
        <section className="next-game">
          <img className="game-photo" src="/assets/varzea-game.jpg" alt="" />
          <div className="game-head">
            <div>
              <span className="eyebrow">{next.status === "LIVE" ? "AO VIVO AGORA" : "PRÓXIMA PARTIDA"}</span>
              <h2>{next.title}</h2>
            </div>
            <StatusPill status={next.myStatus} />
          </div>
          <div className="game-meta">
            <div className="date-box">
              <strong>{day(next.startsAt)}</strong>
              <span>{monthShort(next.startsAt)}</span>
            </div>
            <div className="meta-lines">
              <span>
                <Icon name="clock" size={17} /> {time(next.startsAt)} · {duration(next.durationMin)}
              </span>
              <span>
                <Icon name="pin" size={17} /> {next.location}
              </span>
            </div>
          </div>
          <div className="capacity">
            <div>
              <span>{next.confirmedCount} confirmados</span>
              <b>{next.maxPlayers} vagas</b>
            </div>
            <div className="progress">
              <i style={{ width: `${Math.min(100, (next.confirmedCount / next.maxPlayers) * 100)}%` }} />
            </div>
          </div>
          {next.status === "SCHEDULED" && next.myStatus !== "CONFIRMED" && next.myStatus !== "WAITLIST" ? (
            <div className="rsvp">
              <button className="primary" disabled={action.busy} onClick={() => respond("CONFIRMED")}>
                <Icon name="check" size={18} /> Vou jogar
              </button>
              {next.myStatus !== "DECLINED" && (
                <button className="ghost" disabled={action.busy} onClick={() => respond("DECLINED")}>
                  Não vou
                </button>
              )}
            </div>
          ) : (
            <button className="primary" onClick={() => navigate(`/partidas/${next.id}`)}>
              Ver detalhes da partida <Icon name="chevron" size={18} />
            </button>
          )}
          {action.error && <p className="form-error on-dark">{action.error}</p>}
        </section>
      ) : (
        <section className="next-game empty">
          <span className="eyebrow">PRÓXIMA PARTIDA</span>
          <h2>Nenhuma partida marcada</h2>
          <p>
            {can("matches.manage")
              ? "Crie a próxima pelada e a VarzIA avisa a galera."
              : "Assim que a organização marcar, ela aparece aqui."}
          </p>
          {can("matches.manage") && (
            <button className="primary" onClick={() => navigate("/partidas/nova")}>
              <Icon name="plus" size={18} /> Nova partida
            </button>
          )}
        </section>
      )}

      <FirstSteps clubId={clubId} />

      <section className="section">
        <div className="section-title">
          <div>
            <span>ACESSO RÁPIDO</span>
            <h2>O que você precisa?</h2>
          </div>
        </div>
        <div className="quick-grid">
          {can("matches.manage") ? (
            <button onClick={() => (next ? navigate(`/partidas/${next.id}/ao-vivo`) : navigate("/partidas/nova"))}>
              <i className="mint">
                <Icon name="play" />
              </i>
              <b>{next?.status === "LIVE" ? "Jogo ao vivo" : "Iniciar jogo"}</b>
              <span>Placar e cronômetro</span>
            </button>
          ) : (
            <button onClick={() => navigate("/clube?aba=estatisticas")}>
              <i className="mint">
                <Icon name="chart" />
              </i>
              <b>Estatísticas</b>
              <span>Artilharia e resultados</span>
            </button>
          )}
          <button onClick={() => (next ? navigate(`/partidas/${next.id}?aba=times`) : navigate("/partidas"))}>
            <i className="purple">
              <Icon name="users" />
            </i>
            <b>{can("matches.manage") ? "Montar times" : "Ver times"}</b>
            <span>Sorteio equilibrado</span>
          </button>
          <button
            onClick={() =>
              can("payments.manage")
                ? navigate("/clube/financeiro")
                : next
                  ? navigate(`/partidas/${next.id}?aba=pagamento`)
                  : navigate("/partidas")
            }
          >
            <i className="amber">
              <Icon name="wallet" />
            </i>
            <b>Pagamentos</b>
            <span>
              {can("payments.manage")
                ? `${next?.pendingPayments ?? 0} pendência${next?.pendingPayments === 1 ? "" : "s"}`
                : next?.myPayment === "PAID"
                  ? "Tudo certo ✓"
                  : "Pagar com Pix"}
            </span>
          </button>
          <button onClick={() => navigate("/clube/bot")}>
            <i className="blue">
              <Icon name="spark" />
            </i>
            <b>VarzIA</b>
            <span>Assistente do clube</span>
          </button>
        </div>
      </section>

      <section className="section activity-section">
        <div className="section-title">
          <h2>Atividade recente</h2>
        </div>
        {activity.data?.length === 0 && (
          <Empty icon="spark" title="Tudo calmo por aqui" text="Confirmações e pagamentos aparecem aqui." />
        )}
        {activity.data?.map((a, i) => (
          <div className="activity" key={i}>
            <div className={`activity-icon ${a.type === "payment" ? "paid" : "joined"}`}>
              <Icon name={a.type === "payment" ? "check" : "user"} size={17} />
            </div>
            <div>
              <b>{a.title}</b>
              <p>{a.detail}</p>
            </div>
            <small>{relative(a.at)}</small>
          </div>
        ))}
      </section>
    </>
  );
}

export function StatusPill({ status }: { status: string }) {
  const label =
    status === "CONFIRMED" ? "Confirmado" : status === "WAITLIST" ? "Na espera" : status === "DECLINED" ? "Fora" : "Sem resposta";
  return <div className={`status-dot s-${status.toLowerCase()}`}>{label}</div>;
}
