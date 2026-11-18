import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { initials } from "../lib/format";

// ---------------------------------------------------------------- Toasts

type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastContext = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <Icon name={t.tone === "ok" ? "check" : "close"} size={16} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---------------------------------------------------------------- Layout helpers

export function Sheet({
  title,
  onClose,
  children,
  action,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  action?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet full-sheet" role="dialog" aria-label={title}>
        <div className="sheet-handle" />
        <div className="sheet-top">
          <button onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
          <span>{title.toUpperCase()}</span>
          <span style={{ width: 35 }} />
        </div>
        <div className="sheet-body">{children}</div>
        {action && <div className="sheet-action">{action}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, back, right }: { title: string; back?: string | true; right?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="page-header">
      {back && (
        <button
          className="back-link"
          onClick={() => (back === true ? navigate(-1) : navigate(back))}
          aria-label="Voltar"
        >
          <Icon name="back" size={18} />
        </button>
      )}
      <h2>{title}</h2>
      <div>{right}</div>
    </div>
  );
}

export function Avatar({ name, index = 0, size }: { name: string; index?: number; size?: number }) {
  return (
    <span className={`avatar a${index % 4}`} style={size ? { width: size, height: size } : undefined}>
      {initials(name)}
    </span>
  );
}

export function Empty({ icon, title, text, children }: { icon: IconName; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <div>
        <Icon name={icon} size={30} />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading" aria-label="Carregando">
      <span />
      <span />
      <span />
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button onClick={onRetry}>
          <Icon name="refresh" size={15} /> Tentar novamente
        </button>
      )}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
