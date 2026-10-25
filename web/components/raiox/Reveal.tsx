"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Entrada ao rolar: sobe 12 px e aparece uma vez. Sem JS, o conteúdo já está visível. */
export function Reveal({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"inicial" | "oculto" | "visivel">("inicial");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) { setEstado("visivel"); return; }
    setEstado("oculto");
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setEstado("visivel"); io.disconnect(); } },
      { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={className} data-reveal={estado}>{children}</Tag>;
}
