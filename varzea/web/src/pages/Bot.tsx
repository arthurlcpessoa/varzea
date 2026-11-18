import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { ErrorBox, Field, FormError, Loading, PageHeader, useToast } from "../components/ui";
import { get, post, put } from "../lib/api";
import { useAuth } from "../lib/auth";
import { time } from "../lib/format";
import { useAction, useLoad } from "../lib/hooks";
import type { Member } from "../lib/types";

interface BotConfig {
  enabled: boolean;
  whatsappGroup: string | null;
  inviteHoursBefore: number;
  reminderHoursBefore: number;
  autoPromoteWaitlist: boolean;
  welcomeMessage: string;
  provider: string;
}

interface BotMessage {
  id: string;
  direction: "IN" | "OUT";
  phone: string;
  body: string;
  createdAt: string;
}

export function BotPage() {
  const { club, can } = useAuth();
  const toast = useToast();
  const cfg = useLoad(() => get<BotConfig>(`/clubs/${club!.id}/bot`), [club!.id]);
  const { busy, error, run } = useAction();
  const [form, setForm] = useState<BotConfig | null>(null);
  const editable = can("bot.configure");

  if (cfg.loading && !cfg.data) return <Loading />;
  if (!cfg.data) return <ErrorBox message={cfg.error ?? "Erro"} onRetry={cfg.reload} />;
  const v = form ?? cfg.data;

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { provider: _p, ...body } = v;
      const saved = await put<BotConfig>(`/clubs/${club!.id}/bot`, body);
      cfg.setData(saved);
      setForm(null);
      toast("Configurações da VarzIA salvas.");
    });
  };

  return (
    <section className="page-section">
      <PageHeader title="VarzIA" back="/clube" />
      <div className="bot-card">
        <div className="bot-head">
          <div className="bot-face">
            <span>•‿•</span>
          </div>
          <div>
            <span>ASSISTENTE INTELIGENTE · PELA-BOT</span>
            <h3>VarzIA</h3>
          </div>
          <i>{v.enabled ? "ONLINE" : "PAUSADA"}</i>
        </div>
        <p>
          A VarzIA conversa com os jogadores no WhatsApp: envia convites, registra quem vai, manda o Pix e avisa quando
          abre vaga. Os jogadores respondem <b>VOU</b>, <b>NÃO VOU</b>, <b>PIX</b>, <b>LISTA</b> ou <b>PARTIDA</b>.
        </p>
        <p className="provider-note">
          Integração atual: <b>{v.provider === "console" ? "modo simulado" : v.provider}</b>
          {v.provider === "console" && " — as mensagens ficam registradas aqui até o provedor de WhatsApp ser conectado."}
        </p>
      </div>

      {editable ? (
        <form className="form" onSubmit={save}>
          <label className="toggle">
            <input type="checkbox" checked={v.enabled} onChange={(e) => setForm({ ...v, enabled: e.target.checked })} />
            <span>Assistente ativo</span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={v.autoPromoteWaitlist} onChange={(e) => setForm({ ...v, autoPromoteWaitlist: e.target.checked })} />
            <span>Promover a lista de espera automaticamente quando alguém desistir</span>
          </label>
          <div className="form-row">
            <Field label="Convite (horas antes)">
              <input type="number" min={1} max={336} value={v.inviteHoursBefore} onChange={(e) => setForm({ ...v, inviteHoursBefore: Number(e.target.value) })} />
            </Field>
            <Field label="Cobrança (horas antes)">
              <input type="number" min={1} max={168} value={v.reminderHoursBefore} onChange={(e) => setForm({ ...v, reminderHoursBefore: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Grupo / número no WhatsApp" hint="Identificador usado pelo provedor de WhatsApp.">
            <input value={v.whatsappGroup ?? ""} onChange={(e) => setForm({ ...v, whatsappGroup: e.target.value || null })} />
          </Field>
          <Field label="Mensagem de boas-vindas">
            <textarea rows={3} value={v.welcomeMessage} onChange={(e) => setForm({ ...v, welcomeMessage: e.target.value })} />
          </Field>
          <FormError message={error} />
          <button className="primary" disabled={busy || !form}>
            Salvar configurações
          </button>
        </form>
      ) : (
        <p className="muted pad-y">Somente a diretoria e a comissão técnica podem configurar o assistente.</p>
      )}

      {editable && <Simulator clubId={club!.id} />}
    </section>
  );
}

/** Simula conversas com o bot como se viessem do WhatsApp de um jogador. */
function Simulator({ clubId }: { clubId: string }) {
  const members = useLoad(() => get<Member[]>(`/clubs/${clubId}/members`), [clubId]);
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const { busy, error, run } = useAction();
  const log = useLoad(
    () => (phone ? get<BotMessage[]>(`/clubs/${clubId}/bot/messages?phone=${phone}`) : Promise.resolve([])),
    [clubId, phone],
  );
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!phone) {
      const first = members.data?.find((m) => m.phone);
      if (first?.phone) setPhone(first.phone);
    }
  }, [members.data, phone]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [log.data]);

  const send = (msg: string) =>
    run(async () => {
      await post(`/clubs/${clubId}/bot/simulate`, { phone, text: msg });
      setText("");
      await log.reload();
    });

  return (
    <>
      <h3 className="block-title">Simulador do WhatsApp</h3>
      <p className="muted small-note">Teste a VarzIA como se você fosse um jogador do clube.</p>
      <Field label="Conversar como">
        <select value={phone} onChange={(e) => setPhone(e.target.value)}>
          {members.data
            ?.filter((m) => m.phone)
            .map((m) => (
              <option key={m.id} value={m.phone!}>
                {m.nickname ?? m.name} · {m.phone}
              </option>
            ))}
        </select>
      </Field>
      <div className="chat">
        {log.data?.length === 0 && <p className="muted center">Nenhuma mensagem ainda. Mande um “oi”.</p>}
        {log.data?.map((m) => (
          <div key={m.id} className={`chat-msg ${m.direction === "IN" ? "in" : "out"}`}>
            <p>{m.body}</p>
            <small>{time(m.createdAt)}</small>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="chips quick-replies">
        {["Oi", "Vou", "Não vou", "Pix", "Lista", "Partida"].map((q) => (
          <button key={q} disabled={busy || !phone} onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="wall-form standalone"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite uma mensagem…" />
        <button disabled={busy || !text.trim() || !phone} aria-label="Enviar">
          <Icon name="send" size={18} />
        </button>
      </form>
      <FormError message={error} />
    </>
  );
}
