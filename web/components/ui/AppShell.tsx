"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Início" },
  { href: "/analise", label: "Análise" },
  { href: "/resultados", label: "Resultados" },
  { href: "/metodologia", label: "Metodologia", hideSm: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);
  // Início e análise ao vivo ocupam a largura toda; as demais páginas usam o contêiner.
  const bleed = pathname === "/" || pathname === "/analise";

  return (
    <div className="app-shell">
      <a className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:rounded-field focus:bg-paper focus:p-2" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="app-topbar">
        <div className="app-container app-topbar__inner">
          <Link className="app-logo" href="/" aria-label="Raio-X do Tráfego, início">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/raio-x-logo-light.svg" alt="" width={84} height={34} />
          </Link>
          <nav className="app-nav" aria-label="Navegação principal">
            {NAV.map(item => <Link key={item.href} href={item.href}
              className={`app-nav__link${item.hideSm ? " app-nav__link--hide-sm" : ""}`}
              aria-current={active(item.href) ? "page" : undefined}>{item.label}</Link>)}
            <Link className="ui-button ui-button--secondary app-nav__cta" href="/enviar">Enviar capturas</Link>
          </nav>
        </div>
      </header>
      <main id="conteudo" className={bleed ? "app-main app-main--bleed" : "app-container app-main"} tabIndex={-1}>{children}</main>
      <footer className="app-footer">
        <div className="app-container app-footer__inner">
          <span className="inline-flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/raio-x-symbol-light.svg" alt="" width={20} height={20} />
            Raio-X do Tráfego · classificação de tráfego cifrado por metadados · UFC Russas</span>
          <span className="font-mono text-xs">Base ISCX VPN-nonVPN 2016 · sem payload, IPs ou portas</span>
        </div>
      </footer>
    </div>
  );
}
