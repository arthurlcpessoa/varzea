import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { get } from "../lib/api";
import { useAuth } from "../lib/auth";
import { todayLabel } from "../lib/format";
import { useLoad } from "../lib/hooks";
import type { Club } from "../lib/types";

/**
 * Telas de primeiro acesso: o usuário acabou de criar a conta e ainda não
 * participa de nenhum clube. Em vez de dados vazios, mostramos chamadas para
 * criar o primeiro clube ou entrar com um código de convite.
 */

/** Cartão de destaque com as duas saídas: criar clube ou usar convite. */
export function NoClubCard({
  eyebrow = "COMECE POR AQUI",
  title = "Crie seu primeiro clube",
  text = "Você vira a diretoria, convida a galera e a VarzIA cuida de presença e Pix.",
}: {
  eyebrow?: string;
  title?: string;
  text?: string;
}) {
  const navigate = useNavigate();
  return (
    <section className="next-game empty onboarding-hero">
      <div className="onboarding-crest">
        <Icon name="shield" size={26} />
      </div>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      <div className="rsvp">
        <button className="primary" onClick={() => navigate("/clubes/novo")}>
          <Icon name="plus" size={18} /> Criar clube
        </button>
        <button className="ghost" onClick={() => navigate("/clubes/novo?modo=convite")}>
          Tenho convite
        </button>
      </div>
    </section>
  );
}

/** Início para quem ainda não tem clube. */
export function NoClubHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.nickname ?? user?.name.split(" ")[0];

  const preview: { icon: IconName; tone: string; title: string; text: string }[] = [
    { icon: "calendar", tone: "mint", title: "Partidas", text: "Marque a pelada e veja quem confirmou" },
    { icon: "wallet", tone: "amber", title: "Pix", text: "Cobrança e conferência por jogador" },
    { icon: "users", tone: "purple", title: "Times", text: "Sorteio equilibrado em um toque" },
    { icon: "spark", tone: "blue", title: "VarzIA", text: "Assistente que fala com a galera no WhatsApp" },
  ];

  return (
    <>
      <section className="welcome">
        <p>{todayLabel()}</p>
        <h1>
          Bem-vindo, {firstName}! <Icon name="ball" size={21} />
        </h1>
        <span className="club-pill muted-pill">
          <span>?</span> Você ainda não está em um clube
        </span>
      </section>

      <NoClubCard />

      <section className="section">
        <div className="section-title">
          <div>
            <span>PRIMEIROS PASSOS</span>
            <h2>Sua pelada organizada em 3 lances</h2>
          </div>
        </div>
        <ol className="onboarding-steps">
          <li className="done">
            <i>
              <Icon name="check" size={16} />
            </i>
            <div>
              <b>Criar sua conta</b>
              <span>Feito! Seu perfil de jogador está pronto.</span>
            </div>
          </li>
          <li className="current">
            <i>2</i>
            <div>
              <b>Criar ou entrar em um clube</b>
              <span>É onde ficam elenco, partidas e pagamentos.</span>
            </div>
            <button onClick={() => navigate("/clubes/novo")} aria-label="Criar clube">
              <Icon name="chevron" size={18} />
            </button>
          </li>
          <li>
            <i>3</i>
            <div>
              <b>Convidar a galera e marcar o jogo</b>
              <span>Mande o link no grupo e crie a primeira partida.</span>
            </div>
          </li>
        </ol>
      </section>

      <section className="section activity-section">
        <div className="section-title">
          <div>
            <span>O QUE TE ESPERA</span>
            <h2>Tudo num lugar só</h2>
          </div>
        </div>
        <div className="quick-grid preview-grid">
          {preview.map((p) => (
            <div key={p.title}>
              <i className={p.tone}>
                <Icon name={p.icon} />
              </i>
              <b>{p.title}</b>
              <span>{p.text}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

const DISMISS_KEY = "varzea.firstSteps.dismissed";
const isDismissed = (clubId: string) => {
  try {
    return (localStorage.getItem(DISMISS_KEY) ?? "").split(",").includes(clubId);
  } catch {
    return false;
  }
};
const dismiss = (clubId: string) => {
  try {
    const list = (localStorage.getItem(DISMISS_KEY) ?? "").split(",").filter(Boolean);
    localStorage.setItem(DISMISS_KEY, [...list, clubId].join(","));
  } catch {
    /* ignora */
  }
};

/**
 * Checklist para quem organiza um clube recém-criado: convidar jogadores,
 * marcar a primeira partida e cadastrar a chave Pix. Some quando tudo estiver
 * feito ou quando o usuário dispensar.
 */
export function FirstSteps({ clubId }: { clubId: string }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(() => isDismissed(clubId));
  const manages = can("matches.manage");
  const club = useLoad(
    () => (manages && !hidden ? get<Club>(`/clubs/${clubId}`) : Promise.resolve(null)),
    [clubId, manages, hidden],
  );

  if (!manages || hidden || !club.data) return null;
  const c = club.data;

  const steps: { done: boolean; title: string; text: string; action: string; to: string; show: boolean }[] = [
    {
      done: true,
      title: "Clube criado",
      text: `${c.name} já está no ar.`,
      action: "",
      to: "",
      show: true,
    },
    {
      done: c.totals.members > 1,
      title: "Convide os jogadores",
      text: "Envie o link de convite no grupo do WhatsApp.",
      action: "Convidar",
      to: "/clube?convidar=1",
      show: can("invites.create"),
    },
    {
      done: c.totals.matches > 0,
      title: "Marque a primeira partida",
      text: "Data, local, vagas e valor por jogador.",
      action: "Criar",
      to: "/partidas/nova",
      show: true,
    },
    {
      done: Boolean(c.pixKey),
      title: "Cadastre a chave Pix",
      text: "Para gerar a cobrança de cada jogador.",
      action: "Cadastrar",
      to: "/clube/configuracoes",
      show: can("club.update"),
    },
  ];
  const visible = steps.filter((s) => s.show);
  const doneCount = visible.filter((s) => s.done).length;
  if (doneCount === visible.length) return null;

  return (
    <section className="section">
      <div className="first-steps">
        <div className="first-steps-head">
          <div>
            <span>PRIMEIROS PASSOS</span>
            <h2>Deixe o clube pronto pro jogo</h2>
          </div>
          <button
            className="first-steps-close"
            aria-label="Dispensar"
            onClick={() => {
              dismiss(clubId);
              setHidden(true);
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="progress light">
          <i style={{ width: `${(doneCount / visible.length) * 100}%` }} />
        </div>
        <small className="first-steps-count">
          {doneCount} de {visible.length} concluídos
        </small>
        <ol className="onboarding-steps">
          {visible.map((s, i) => (
            <li key={s.title} className={s.done ? "done" : ""}>
              <i>{s.done ? <Icon name="check" size={16} /> : i + 1}</i>
              <div>
                <b>{s.title}</b>
                <span>{s.text}</span>
              </div>
              {!s.done && (
                <button className="step-action" onClick={() => navigate(s.to)}>
                  {s.action}
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
