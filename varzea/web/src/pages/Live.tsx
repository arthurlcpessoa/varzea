import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { ErrorBox, FormError, Loading, useToast } from "../components/ui";
import { del, get, getToken, post } from "../lib/api";
import { clock, minute } from "../lib/format";
import { useAction, useLoad } from "../lib/hooks";
import type { MatchDetail, Person, Timer } from "../lib/types";

/** Relógio local sincronizado com o estado do servidor. */
function useClock(timer: Timer | undefined) {
  const [now, setNow] = useState(Date.now());
  const [base, setBase] = useState({ at: Date.now(), timer });
  useEffect(() => {
    setBase({ at: Date.now(), timer });
  }, [timer]);
  useEffect(() => {
    if (!timer?.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [timer?.running]);
  if (!base.timer) return 0;
  return base.timer.elapsedSec + (base.timer.running ? Math.max(0, (now - base.at) / 1000) : 0);
}

export function LivePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: m, setData, error, loading, reload } = useLoad(() => get<MatchDetail>(`/matches/${id}`), [id]);
  const action = useAction();
  const [goalFor, setGoalFor] = useState<"A" | "B" | null>(null);
  const seconds = useClock(m?.timer);

  // Atualização em tempo real para quem acompanha (RF45); se a conexão cair,
  // o EventSource reconecta sozinho e a tela continua utilizável.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const es = new EventSource(`/api/matches/${id}/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener("update", () => void reload());
    return () => es.close();
  }, [id, reload]);

  const teamName = { A: "Time Verde", B: "Time Preto" } as const;
  const people = useMemo(() => m?.people.filter((p) => p.status === "CONFIRMED") ?? [], [m]);

  if (loading && !m) return <div className="live-view"><Loading /></div>;
  if (error || !m) return <div className="live-view"><ErrorBox message={error ?? "Partida não encontrada."} onRetry={reload} /></div>;

  const act = (path: string, ok?: string) =>
    action.run(async () => {
      setData(await post<MatchDetail>(`/matches/${m.id}${path}`));
      if (ok) toast(ok);
    });

  const manage = m.canManage && m.status !== "FINISHED" && m.status !== "CANCELED";
  const notStarted = m.status === "SCHEDULED" && m.timer.elapsedSec === 0 && !m.timer.running;

  return (
    <div className="live-view">
      <div className="live-top">
        <button onClick={() => navigate(`/partidas/${m.id}`)} aria-label="Fechar">
          <Icon name="close" />
        </button>
        <span>
          {m.status === "LIVE" && <i />}
          {m.status === "LIVE" ? "PARTIDA AO VIVO" : m.status === "FINISHED" ? "PARTIDA ENCERRADA" : "PRÉ-JOGO"}
        </span>
        <span style={{ width: 38 }} />
      </div>
      <div className="live-title">
        <p>{m.title.toUpperCase()}</p>
        <h2>{m.clubName}</h2>
      </div>
      <div className="timer">
        <span>
          {m.status === "FINISHED" ? "FIM DE JOGO" : m.timer.running ? `${m.timer.period}º TEMPO` : notStarted ? "AGUARDANDO INÍCIO" : "JOGO PAUSADO"}
        </span>
        <strong>{clock(seconds)}</strong>
      </div>
      <div className="scoreboard">
        {(["A", "B"] as const).map((t, i) => (
          <div key={t} style={{ order: i === 0 ? 0 : 2 }}>
            <i className={`team-badge ${t === "A" ? "green" : "black"}`}>{t === "A" ? "V" : "P"}</i>
            <b>{teamName[t]}</b>
            {manage && m.status === "LIVE" && (
              <button onClick={() => setGoalFor(t)}>
                <Icon name="plus" size={16} /> Gol
              </button>
            )}
          </div>
        ))}
        <strong style={{ order: 1 }}>
          {m.score.A}
          <span>—</span>
          {m.score.B}
        </strong>
      </div>

      {manage && (
        <div className="live-controls">
          {m.timer.running ? (
            <button className="pause-button" disabled={action.busy} onClick={() => act("/live/pause")}>
              <Icon name="pause" /> Pausar partida
            </button>
          ) : (
            <button className="pause-button" disabled={action.busy} onClick={() => act("/live/start", notStarted ? "Partida iniciada!" : undefined)}>
              <Icon name="play" /> {notStarted ? "Iniciar partida" : "Retomar partida"}
            </button>
          )}
          {m.status === "LIVE" && !m.timer.running && (
            <button className="period-button" disabled={action.busy} onClick={() => act("/live/period", "Novo tempo — cronômetro zerado.")}>
              <Icon name="flag" size={16} /> Próximo tempo
            </button>
          )}
        </div>
      )}
      <FormError message={action.error} />

      <div className="events">
        <h3>Lances da partida</h3>
        {m.events.length === 0 && <p className="muted">Nenhum gol ainda.</p>}
        {m.events.map((e) => (
          <div key={e.id}>
            <span>{minute(e.second)}</span>
            <i>
              <Icon name="ball" size={14} />
            </i>
            <p>
              <b>Gol · {teamName[e.team]}</b>
              <small>
                {e.scorer ?? "Autor não informado"}
                {e.assist ? ` · Assist. ${e.assist}` : ""}
              </small>
            </p>
            {manage && (
              <button
                className="event-del"
                aria-label="Remover lance"
                onClick={() =>
                  action.run(async () => {
                    if (!confirm("Remover este gol?")) return;
                    setData(await del<MatchDetail>(`/matches/${m.id}/events/${e.id}`));
                  })
                }
              >
                <Icon name="trash" size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      {manage && m.status === "LIVE" && (
        <button
          className="finish"
          onClick={() => {
            if (confirm("Encerrar a partida? O placar final será registrado.")) void act("/live/finish", "Partida encerrada!");
          }}
        >
          Encerrar partida
        </button>
      )}

      {goalFor && (
        <GoalPicker
          team={goalFor}
          teamLabel={teamName[goalFor]}
          people={people}
          onClose={() => setGoalFor(null)}
          onSave={(scorerId, assistId) =>
            action.run(async () => {
              setData(await post<MatchDetail>(`/matches/${m.id}/events`, { team: goalFor, scorerId, assistId }));
              setGoalFor(null);
              toast("Gol registrado! ⚽");
            })
          }
        />
      )}
    </div>
  );
}

function GoalPicker({
  team,
  teamLabel,
  people,
  onClose,
  onSave,
}: {
  team: "A" | "B";
  teamLabel: string;
  people: Person[];
  onClose: () => void;
  onSave: (scorerId: string | null, assistId: string | null) => void;
}) {
  const own = people.filter((p) => p.team === team);
  const list = own.length > 0 ? own : people;
  const [scorer, setScorer] = useState<string | null>(null);
  const [assist, setAssist] = useState<string | null>(null);
  const name = (p: Person) => p.nickname ?? p.name;

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet goal-sheet" role="dialog" aria-label={`Gol do ${teamLabel}`}>
        <div className="sheet-handle" />
        <h3>Gol do {teamLabel} ⚽</h3>
        <p className="muted">Quem marcou?</p>
        <div className="chips">
          {list.map((p) => (
            <button key={p.memberId} className={scorer === p.memberId ? "on" : ""} onClick={() => setScorer(scorer === p.memberId ? null : p.memberId)}>
              {name(p)}
            </button>
          ))}
        </div>
        {scorer && (
          <>
            <p className="muted">Assistência (opcional)</p>
            <div className="chips">
              {list
                .filter((p) => p.memberId !== scorer)
                .map((p) => (
                  <button key={p.memberId} className={assist === p.memberId ? "on" : ""} onClick={() => setAssist(assist === p.memberId ? null : p.memberId)}>
                    {name(p)}
                  </button>
                ))}
            </div>
          </>
        )}
        <div className="goal-actions">
          <button className="ghost-dark" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" onClick={() => onSave(scorer, assist)}>
            {scorer ? "Registrar gol" : "Registrar sem autor"}
          </button>
        </div>
      </div>
    </div>
  );
}
