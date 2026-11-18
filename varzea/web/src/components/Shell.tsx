import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { useAuth } from "../lib/auth";
import { get } from "../lib/api";
import { relative } from "../lib/format";

const NAV: [string, IconName, string][] = [
  ["/", "home", "Início"],
  ["/partidas", "ball", "Partidas"],
  ["/clube", "shield", "Clube"],
  ["/perfil", "user", "Perfil"],
];

const TITLES: [RegExp, string][] = [
  [/^\/partidas/, "Partidas"],
  [/^\/clube/, "Meu clube"],
  [/^\/perfil/, "Perfil"],
];

interface Announcement {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string; nickname: string | null };
}

export function Brand() {
  return (
    <div className="brand">
      <img src="/assets/varzea-mark-transparent.png" alt="" />
      <span>varzea</span>
    </div>
  );
}

function Notices({ clubId }: { clubId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Announcement[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    get<Announcement[]>(`/clubs/${clubId}/announcements`)
      .then(setItems)
      .catch(() => setItems([]));
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, clubId]);

  return (
    <div ref={ref} className="notices">
      <button className="icon-button" onClick={() => setOpen(!open)} aria-label="Avisos do clube" aria-expanded={open}>
        <Icon name="bell" size={21} />
      </button>
      {open && (
        <div className="notification notification-list">
          <b>Avisos do clube</b>
          {items === null && <p>Carregando…</p>}
          {items?.length === 0 && <p>Nenhum aviso por enquanto.</p>}
          {items?.slice(0, 5).map((a) => (
            <div key={a.id} className="notice-item">
              <p>{a.body}</p>
              <small>
                {a.author.nickname ?? a.author.name} · {relative(a.createdAt)}
              </small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Shell() {
  const { club } = useAuth();
  const { pathname } = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  const title = TITLES.find(([re]) => re.test(pathname))?.[1];

  return (
    <main className="app-stage">
      <div className="phone">
        <header className="topbar">
          {pathname === "/" || !title ? <Brand /> : <h1>{title}</h1>}
          {club && <Notices clubId={club.id} />}
        </header>

        <div className="content" ref={contentRef}>
          <div className="content-inner">
            <Outlet />
          </div>
        </div>

        <nav className="bottom-nav" aria-label="Navegação principal">
          <div className="nav-brand">
            <Brand />
          </div>
          {NAV.map(([to, icon, label]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
              <Icon name={icon} size={22} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </main>
  );
}
