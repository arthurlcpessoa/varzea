import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { NoClubCard } from "../components/Onboarding";
import { Empty, ErrorBox, Field, FormError, Loading, PageHeader, Segmented, useToast } from "../components/ui";
import { get, patch, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { brl, day, monthLong, time, toLocalInput, weekdayShort } from "../lib/format";
import { useAction, useLoad } from "../lib/hooks";
import type { MatchDetail, MatchSummary } from "../lib/types";

type Filter = "upcoming" | "live" | "finished";

export function MatchesPage() {
  const { club } = useAuth();
  if (!club) {
    return (
      <section className="page-section">
        <Empty icon="calendar" title="Nenhuma partida por aqui" text="As partidas pertencem a um clube. Crie o seu ou entre com um convite para marcar o primeiro jogo." />
        <NoClubCard eyebrow="SEM CLUBE AINDA" title="Bora montar a resenha?" />
      </section>
    );
  }
  return <ClubMatches />;
}

function ClubMatches() {
  const { club, can } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("upcoming");
  const { data, error, loading, reload } = useLoad(
    () => get<MatchSummary[]>(`/clubs/${club!.id}/matches?filter=${filter}`),
    [club!.id, filter],
  );

  let lastMonth = "";
  return (
    <section className="page-section">
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "upcoming", label: "Próximas" },
          { value: "live", label: "Em andamento" },
          { value: "finished", label: "Finalizadas" },
        ]}
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : data && data.length > 0 ? (
        data.map((m, i) => {
          const month = monthLong(m.startsAt);
          const showMonth = month !== lastMonth;
          lastMonth = month;
          return (
            <div key={m.id}>
              {showMonth && <div className="month-label">{month}</div>}
              <button
                className={`match-card ${i === 0 && filter !== "finished" ? "featured" : ""}`}
                onClick={() => navigate(m.status === "LIVE" ? `/partidas/${m.id}/ao-vivo` : `/partidas/${m.id}`)}
              >
                <div className="match-date">
                  <strong>{day(m.startsAt)}</strong>
                  <span>{weekdayShort(m.startsAt)}</span>
                </div>
                <div className="match-main">
                  <div>
                    <h3>
                      {m.title}
                      {m.status === "CANCELED" && <em className="tag tag-red">Cancelada</em>}
                    </h3>
                    <span>
                      <Icon name="clock" size={14} />
                      {time(m.startsAt)} · {m.location}
                    </span>
                  </div>
                  <div className="match-tags">
                    {m.status === "FINISHED" ? (
                      <div className="mini-count">
                        <Icon name="trophy" size={15} />
                        {m.score.A} × {m.score.B}
                      </div>
                    ) : (
                      <div className="mini-count">
                        <Icon name="users" size={15} />
                        {m.confirmedCount}/{m.maxPlayers}
                      </div>
                    )}
                    {m.myStatus === "CONFIRMED" && m.status === "SCHEDULED" && <div className="mini-count ok">Você vai</div>}
                    {m.myStatus === "WAITLIST" && <div className="mini-count warn">Na espera</div>}
                  </div>
                </div>
                <Icon name="chevron" size={18} />
              </button>
            </div>
          );
        })
      ) : (
        <Empty
          icon={filter === "live" ? "clock" : filter === "finished" ? "trophy" : "calendar"}
          title={
            filter === "live" ? "Nenhuma partida rolando" : filter === "finished" ? "A história começa em campo" : "Nenhuma partida marcada"
          }
          text={
            filter === "live"
              ? "Quando uma partida começar, acompanhe tudo por aqui."
              : filter === "finished"
                ? "Seus jogos finalizados e resultados aparecerão aqui."
                : "As próximas peladas do clube aparecem aqui."
          }
        />
      )}
      {can("matches.manage") && (
        <button className="fab" onClick={() => navigate("/partidas/nova")}>
          <Icon name="plus" /> Nova partida
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Criar / editar

export function MatchFormPage() {
  const { id } = useParams();
  const { club } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const existing = useLoad(() => (id ? get<MatchDetail>(`/matches/${id}`) : Promise.resolve(null)), [id]);

  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(20, 0, 0, 0);

  const [form, setForm] = useState<null | {
    title: string;
    startsAt: string;
    durationMin: string;
    location: string;
    maxPlayers: string;
    price: string;
    notes: string;
  }>(null);

  const m = existing.data;
  const values =
    form ??
    (m
      ? {
          title: m.title,
          startsAt: toLocalInput(new Date(m.startsAt)),
          durationMin: String(m.durationMin),
          location: m.location,
          maxPlayers: String(m.maxPlayers),
          price: (m.priceCents / 100).toFixed(2).replace(".", ","),
          notes: m.notes ?? "",
        }
      : {
          title: "Pelada",
          startsAt: toLocalInput(nextWeek),
          durationMin: "90",
          location: "",
          maxPlayers: "20",
          price: "0,00",
          notes: "",
        });
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...values, [k]: e.target.value });

  if (id && existing.loading) return <Loading />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const body = {
        title: values.title,
        startsAt: new Date(values.startsAt).toISOString(),
        durationMin: Number(values.durationMin),
        location: values.location,
        maxPlayers: Number(values.maxPlayers),
        priceCents: Math.round(Number(values.price.replace(/\./g, "").replace(",", ".") || 0) * 100),
        notes: values.notes || null,
      };
      if (id) {
        await patch(`/matches/${id}`, body);
        toast("Partida atualizada.");
        navigate(`/partidas/${id}`);
      } else {
        const created = await post<{ id: string }>(`/clubs/${club!.id}/matches`, body);
        toast("Partida criada!");
        navigate(`/partidas/${created.id}`);
      }
    });
  };

  return (
    <section className="page-section">
      <PageHeader title={id ? "Editar partida" : "Nova partida"} back={true} />
      <form className="form" onSubmit={submit}>
        <Field label="Nome da partida">
          <input required value={values.title} onChange={set("title")} placeholder="Pelada de quarta" />
        </Field>
        <div className="form-row">
          <Field label="Data e horário">
            <input type="datetime-local" required value={values.startsAt} onChange={set("startsAt")} />
          </Field>
          <Field label="Duração (min)">
            <input type="number" min={10} max={300} required value={values.durationMin} onChange={set("durationMin")} />
          </Field>
        </div>
        <Field label="Local">
          <input required value={values.location} onChange={set("location")} placeholder="Arena Boa Viagem" />
        </Field>
        <div className="form-row">
          <Field label="Vagas">
            <input type="number" min={2} max={100} required value={values.maxPlayers} onChange={set("maxPlayers")} />
          </Field>
          <Field label="Valor por jogador (R$)" hint="0 para partida gratuita">
            <input inputMode="decimal" value={values.price} onChange={set("price")} />
          </Field>
        </div>
        <Field label="Observações">
          <textarea rows={3} value={values.notes} onChange={set("notes")} placeholder="Ex.: levar colete verde e preto" />
        </Field>
        <FormError message={error} />
        <button className="primary" disabled={busy}>
          {id ? "Salvar alterações" : "Criar partida"}
        </button>
      </form>
    </section>
  );
}

export { brl };
