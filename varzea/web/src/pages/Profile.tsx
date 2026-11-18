import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Field, FormError, Sheet, useToast } from "../components/ui";
import { get, patch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { initials, ROLE_LABEL } from "../lib/format";
import { useAction, useLoad } from "../lib/hooks";

interface Stats {
  players: { memberId: string; goals: number; assists: number; matches: number }[];
}

export function ProfilePage() {
  const { user, club, clubs, selectClub, logout } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const stats = useLoad(
    () => (club ? get<Stats>(`/clubs/${club.id}/stats`) : Promise.resolve(null)),
    [club?.id],
  );
  const mine = stats.data?.players.find((p) => p.memberId === club?.memberId);

  if (!user) return null;
  return (
    <section className="page-section profile">
      <div className="profile-head">
        <div className="large-avatar">{initials(user.name)}</div>
        <h2>{user.name}</h2>
        <p>
          {user.nickname ? `“${user.nickname}” · ` : ""}
          {club ? `${ROLE_LABEL[club.role]} no ${club.name}` : "Jogador sem clube"}
        </p>
        <button onClick={() => setEditing(true)}>Editar perfil</button>
      </div>
      <div className="season-card">
        <span>MINHA TEMPORADA{club ? ` · ${club.name.toUpperCase()}` : ""}</span>
        {!club && <p className="season-empty">Seus jogos, gols e assistências começam a contar na primeira partida.</p>}
        <div>
          <p>
            <strong>{mine?.matches ?? 0}</strong>Jogos
          </p>
          <p>
            <strong>{mine?.goals ?? 0}</strong>Gols
          </p>
          <p>
            <strong>{mine?.assists ?? 0}</strong>Assist.
          </p>
        </div>
      </div>

      <h3 className="block-title">Meus clubes</h3>
      <div className="management profile-list">
        {clubs.map((c) => (
          <button key={c.id} onClick={() => selectClub(c.id)}>
            <i>
              <Icon name="shield" />
            </i>
            <div>
              <b>{c.name}</b>
              <span>{ROLE_LABEL[c.role]}</span>
            </div>
            {c.id === club?.id ? <Icon name="check" /> : <Icon name="chevron" />}
          </button>
        ))}
        <button onClick={() => navigate("/clubes/novo")} className={clubs.length === 0 ? "highlight" : ""}>
          <i>
            <Icon name="plus" />
          </i>
          <div>
            <b>{clubs.length === 0 ? "Criar meu primeiro clube" : "Criar ou entrar em outro clube"}</b>
            <span>{clubs.length === 0 ? "Ou entre com um código de convite" : "Com código de convite"}</span>
          </div>
          <Icon name="chevron" />
        </button>
      </div>

      <h3 className="block-title">Conta</h3>
      <div className="management profile-list">
        <button onClick={() => setEditing(true)}>
          <i>
            <Icon name="user" />
          </i>
          <div>
            <b>Dados pessoais</b>
            <span>{user.email}</span>
          </div>
          <Icon name="chevron" />
        </button>
        <button onClick={() => navigate("/recuperar")}>
          <i>
            <Icon name="shield" />
          </i>
          <div>
            <b>Privacidade e segurança</b>
            <span>Redefinir senha</span>
          </div>
          <Icon name="chevron" />
        </button>
      </div>
      <button className="logout" onClick={logout}>
        Sair da conta
      </button>
      {editing && <EditProfile onClose={() => setEditing(false)} />}
    </section>
  );
}

function EditProfile({ onClose }: { onClose: () => void }) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [form, setForm] = useState({ name: user!.name, nickname: user!.nickname ?? "", phone: user!.phone ?? "" });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await patch("/auth/me", { name: form.name, nickname: form.nickname || null, phone: form.phone || null });
      await refresh();
      toast("Perfil atualizado.");
      onClose();
    });
  };

  return (
    <Sheet title="Editar perfil" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nome completo">
          <input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Apelido no campo">
          <input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
        </Field>
        <Field label="Telefone (WhatsApp)" hint="Usado pela VarzIA para te reconhecer no WhatsApp.">
          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <FormError message={error} />
        <button className="primary" disabled={busy}>
          Salvar
        </button>
      </form>
    </Sheet>
  );
}
