import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { FormError, useToast } from "../components/ui";
import { post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction } from "../lib/hooks";

const INVITE_KEY = "varzea.invite";
const pendingInvite = {
  get: () => {
    try {
      return sessionStorage.getItem(INVITE_KEY);
    } catch {
      return null;
    }
  },
  set: (code: string | null) => {
    try {
      if (code) sessionStorage.setItem(INVITE_KEY, code);
      else sessionStorage.removeItem(INVITE_KEY);
    } catch {
      /* ignora */
    }
  },
};

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="app-stage auth-stage">
      <div className="phone auth-phone">
        <div className="auth-glow" />
        <header className="auth-brand">
          <img src="/assets/varzea-mark-transparent.png" alt="" />
          <span>varzea</span>
        </header>
        <section className="auth-content">{children}</section>
        <footer className="auth-footer">FUTEBOL AMADOR, ORGANIZAÇÃO PROFISSIONAL.</footer>
      </div>
    </main>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="auth-back" onClick={onClick}>
      <Icon name="back" size={18} /> Voltar
    </button>
  );
}

/** Depois de entrar, aceita um convite pendente (link /convite/:code). */
async function acceptPendingInvite(refresh: () => Promise<void>, selectClub: (id: string) => void) {
  const code = pendingInvite.get();
  if (!code) return null;
  pendingInvite.set(null);
  try {
    const club = await post<{ id: string; name: string }>("/clubs/join", { code });
    await refresh();
    selectClub(club.id);
    return club;
  } catch {
    return null;
  }
}

export function LoginPage() {
  const { login, status, refresh, selectClub } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { busy, error, run } = useAction();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (status === "authenticated") return <Navigate to="/" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await login(email, password);
      const club = await acceptPendingInvite(refresh, selectClub);
      if (club) toast(`Você entrou no ${club.name}!`);
      navigate("/");
    });
  };

  return (
    <AuthLayout>
      <div className="auth-panel">
        <span className="auth-kicker">BEM-VINDO DE VOLTA</span>
        <h1>Seu futebol começa aqui.</h1>
        <p>Entre para organizar partidas, confirmar presença e acompanhar seu clube.</p>
        <form onSubmit={submit}>
          <label>
            E-mail
            <input type="email" required autoComplete="email" placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Senha
            <input type="password" required autoComplete="current-password" placeholder="Sua senha" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <Link to="/recuperar" className="forgot">
            Esqueci minha senha
          </Link>
          <FormError message={error} />
          <button className="auth-primary" type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"} <Icon name="chevron" size={18} />
          </button>
        </form>
        <p className="auth-switch">
          Ainda não tem uma conta? <Link to="/cadastro">Criar conta</Link>
        </p>
      </div>
    </AuthLayout>
  );
}

/**
 * Cadastro de quem ainda não tem conta (RF01). São duas etapas — dados de
 * jogador e acesso. Depois disso o usuário entra direto no painel, ainda sem
 * clube: as telas mostram chamadas para criar o primeiro clube ou usar um
 * convite (ver components/Onboarding.tsx). Se veio por link de convite, já
 * entra no clube automaticamente.
 */
export function RegisterPage() {
  const { register, status, refresh, selectClub } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { busy, error, setError, run } = useAction();
  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", nickname: "", email: "", password: "", confirm: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const invite = pendingInvite.get();

  if (status === "authenticated" && !creating) return <Navigate to="/" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (step === 1) return setStep(2);
    if (form.password !== form.confirm) return setError("As senhas não conferem.");
    setCreating(true);
    void run(async () => {
      try {
        await register({
          name: form.name,
          phone: form.phone || undefined,
          nickname: form.nickname || undefined,
          email: form.email,
          password: form.password,
        });
      } catch (err) {
        setCreating(false);
        throw err;
      }
      const club = await acceptPendingInvite(refresh, selectClub);
      toast(club ? `Conta criada! Você entrou no ${club.name}.` : "Conta criada! Bem-vindo ao Várzea.");
      navigate("/", { replace: true });
    });
  };

  return (
    <AuthLayout>
      <form className="auth-panel register-panel" onSubmit={submit}>
        <BackButton onClick={() => (step === 1 ? navigate("/entrar") : setStep(1))} />
        <StepHead step={step} total={2} />
        {step === 1 ? (
          <>
            {invite && (
              <div className="invite-banner">
                <Icon name="users" size={17} /> Você recebeu um convite. Crie sua conta para entrar no clube.
              </div>
            )}
            <span className="auth-kicker">CRIE SUA CONTA</span>
            <h1>Primeiro, fale sobre você.</h1>
            <p>Esses dados serão usados no seu perfil de jogador.</p>
            <label>
              Nome completo
              <input required minLength={2} autoComplete="name" placeholder="Como você se chama?" value={form.name} onChange={set("name")} />
            </label>
            <label>
              Telefone (WhatsApp)
              <input type="tel" autoComplete="tel" placeholder="(81) 99999-9999" value={form.phone} onChange={set("phone")} />
            </label>
            <label>
              Apelido no campo
              <input placeholder="Como a galera te chama?" value={form.nickname} onChange={set("nickname")} />
            </label>
          </>
        ) : (
          <>
            <span className="auth-kicker">SEU ACESSO</span>
            <h1>Agora, proteja sua conta.</h1>
            <p>Use um e-mail que você acessa e uma senha segura.</p>
            <label>
              E-mail
              <input type="email" required autoComplete="email" placeholder="voce@email.com" value={form.email} onChange={set("email")} />
            </label>
            <label>
              Crie uma senha
              <input type="password" required minLength={8} autoComplete="new-password" placeholder="Mínimo de 8 caracteres" value={form.password} onChange={set("password")} />
            </label>
            <label>
              Confirme a senha
              <input type="password" required minLength={8} autoComplete="new-password" placeholder="Digite a senha novamente" value={form.confirm} onChange={set("confirm")} />
            </label>
          </>
        )}
        <FormError message={error} />
        <button className="auth-primary" type="submit" disabled={busy}>
          {busy ? "Criando conta…" : step === 1 ? "Continuar" : "Criar minha conta"} <Icon name="chevron" size={18} />
        </button>
        <p className="terms">
          Ao continuar, você concorda com os <b>Termos de uso</b> e a <b>Política de privacidade</b>.
        </p>
        <p className="auth-switch">
          Já tem uma conta? <Link to="/entrar">Entrar</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

function StepHead({ step, total }: { step: number; total: number }) {
  return (
    <div className="step-head">
      <span>
        ETAPA {step} DE {total}
      </span>
      <div>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={step > i ? "done" : ""} />
        ))}
      </div>
    </div>
  );
}

/** Criar um clube ou entrar com código de convite. */
function FirstClub({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { refresh, selectClub, clubs } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const { busy, error, run } = useAction();
  const [mode, setMode] = useState<"create" | "join">(
    pendingInvite.get() || params.get("modo") === "convite" ? "join" : "create",
  );
  const [club, setClub] = useState({ name: "", city: "", state: "" });
  const [code, setCode] = useState(pendingInvite.get() ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const created =
        mode === "create"
          ? await post<{ id: string; name: string }>("/clubs", club)
          : await post<{ id: string; name: string }>("/clubs/join", { code });
      pendingInvite.set(null);
      await refresh();
      selectClub(created.id);
      toast(mode === "create" ? `${created.name} criado!` : `Você entrou no ${created.name}!`);
      onDone();
    });
  };

  return (
    <AuthLayout>
      <form className="auth-panel register-panel" onSubmit={submit}>
        <BackButton onClick={onBack} />
        <span className="auth-kicker">{clubs.length === 0 ? "SEU PRIMEIRO CLUBE" : "NOVO CLUBE"}</span>
        <h1>{mode === "create" ? "Monte sua resenha." : "Entre no seu time."}</h1>
        <p>
          {mode === "create"
            ? "Crie um clube agora — você vira a diretoria e convida a galera."
            : "Digite o código de convite que a organização do clube te enviou."}
        </p>
        {mode === "create" ? (
          <>
            <div className="club-create-icon">
              <Icon name="shield" size={28} />
            </div>
            <label>
              Nome do clube
              <input required minLength={2} placeholder="Ex.: Resenha FC" value={club.name} onChange={(e) => setClub({ ...club, name: e.target.value })} />
            </label>
            <div className="field-row">
              <label>
                Cidade
                <input placeholder="Recife" value={club.city} onChange={(e) => setClub({ ...club, city: e.target.value })} />
              </label>
              <label>
                Estado
                <input maxLength={2} placeholder="PE" value={club.state} onChange={(e) => setClub({ ...club, state: e.target.value })} />
              </label>
            </div>
          </>
        ) : (
          <label>
            Código de convite
            <input required className="code-input" placeholder="EX: K7P2QD" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </label>
        )}
        <FormError message={error} />
        <button className="auth-primary" type="submit" disabled={busy}>
          {mode === "create" ? "Criar clube e começar" : "Entrar no clube"} <Icon name="chevron" size={18} />
        </button>
        <button type="button" className="skip-club" onClick={() => setMode(mode === "create" ? "join" : "create")}>
          {mode === "create" ? "Tenho um código de convite" : "Prefiro criar um clube"}
        </button>
      </form>
    </AuthLayout>
  );
}

/** Rota antiga de boas-vindas: o início já mostra o onboarding para quem não tem clube. */
export function WelcomePage() {
  return <Navigate to="/" replace />;
}

export function NewClubPage() {
  const navigate = useNavigate();
  const { clubs } = useAuth();
  const isFirst = clubs.length === 0;
  // No primeiro clube, volta ao início para ver o checklist de primeiros passos.
  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/"));
  return <FirstClub onBack={back} onDone={() => navigate(isFirst ? "/" : "/clube")} />;
}

export function RecoverPage() {
  const { busy, error, run } = useAction();
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ message: string; devResetUrl?: string } | null>(null);
  const navigate = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => setResult(await post("/auth/forgot", { email })));
  };

  return (
    <AuthLayout>
      <form className="auth-panel recovery-panel" onSubmit={submit}>
        <BackButton onClick={() => navigate("/entrar")} />
        <div className="auth-symbol">
          <Icon name="user" size={25} />
        </div>
        <span className="auth-kicker">RECUPERAR ACESSO</span>
        <h1>Vamos colocar você de volta em campo.</h1>
        <p>Informe seu e-mail e enviaremos as instruções para criar uma nova senha.</p>
        {result ? (
          <div className="info-box">
            <p>{result.message}</p>
            {result.devResetUrl && (
              <p className="dev-note">
                Ambiente de desenvolvimento — sem envio de e-mail.{" "}
                <a href={result.devResetUrl}>Abrir link de redefinição</a>
              </p>
            )}
          </div>
        ) : (
          <>
            <label>
              E-mail
              <input type="email" required placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <FormError message={error} />
            <button className="auth-primary" disabled={busy}>
              Enviar instruções <Icon name="chevron" size={18} />
            </button>
          </>
        )}
      </form>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { busy, error, setError, run } = useAction();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("As senhas não conferem.");
    void run(async () => {
      await post("/auth/reset", { token: params.get("token"), password });
      toast("Senha alterada! Entre com a nova senha.");
      navigate("/entrar");
    });
  };

  return (
    <AuthLayout>
      <form className="auth-panel recovery-panel" onSubmit={submit}>
        <span className="auth-kicker">NOVA SENHA</span>
        <h1>Escolha uma nova senha.</h1>
        <p>Use pelo menos 8 caracteres.</p>
        <label>
          Nova senha
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Confirme a senha
          <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <FormError message={error} />
        <button className="auth-primary" disabled={busy}>
          Salvar nova senha <Icon name="chevron" size={18} />
        </button>
      </form>
    </AuthLayout>
  );
}

/** Link de convite: entra direto se estiver logado; senão guarda o código. */
export function InvitePage() {
  const { code = "" } = useParams();
  const { status, refresh, selectClub } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "anonymous") {
      pendingInvite.set(code.toUpperCase());
      navigate("/cadastro", { replace: true });
      return;
    }
    post<{ id: string; name: string }>("/clubs/join", { code })
      .then(async (club) => {
        await refresh();
        selectClub(club.id);
        toast(`Você entrou no ${club.name}!`);
        navigate("/", { replace: true });
      })
      .catch((e: Error) => setError(e.message));
  }, [status, code, navigate, refresh, selectClub, toast]);

  return (
    <AuthLayout>
      <div className="auth-panel">
        <span className="auth-kicker">CONVITE</span>
        <h1>{error ? "Não deu certo." : "Entrando no clube…"}</h1>
        {error && (
          <>
            <p>{error}</p>
            <Link className="auth-primary" to="/">
              Ir para o início
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
