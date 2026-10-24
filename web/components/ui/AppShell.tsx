"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <a className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:rounded-field focus:bg-surface-2 focus:p-2" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="app-topbar">
        <div className="app-container app-topbar__inner">
          <Link className="app-logo" href="/" aria-label="Raio-X do Tráfego, início">
            <Image className="app-logo__mark" src="/brand/raio-x-symbol.svg" alt="" width={40} height={40} unoptimized />
            <span className="app-logo__name">Raio-X <span className="app-logo__tail">do Tráfego</span></span>
          </Link>
          <nav className="app-nav" aria-label="Navegação principal">
            <Link className="app-nav__link" href="/" aria-current={pathname === "/" ? "page" : undefined}>Início</Link>
            <Link className="app-nav__link" href="/metodologia" aria-current={pathname === "/metodologia" ? "page" : undefined}>Metodologia</Link>
            <Link className="ui-button ui-button--primary" href="/">Nova análise</Link>
          </nav>
        </div>
      </header>
      <main id="conteudo" className="app-container app-main" tabIndex={-1}>{children}</main>
      <footer className="app-footer">
        <div className="app-container app-footer__inner">
          <span>Modelos treinados com tráfego do ISCX de 2016. Em capturas atuais, os palpites podem errar mais.</span>
        </div>
      </footer>
    </div>
  );
}
