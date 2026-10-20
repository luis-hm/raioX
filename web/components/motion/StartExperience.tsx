"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PacketStream } from "./PacketStream";
import styles from "./start.module.css";

const examples = [
  { id: "chat", label: "Chat", protocol: "TCP" },
  { id: "email", label: "E-mail", protocol: "TCP" },
  { id: "transferencia", label: "Transferência", protocol: "TCP" },
  { id: "streaming", label: "Streaming", protocol: "TCP" },
  { id: "voip", label: "VoIP", protocol: "UDP" },
] as const;

const maxBytes = 200_000_000;

export function StartExperience() {
  const [file, setFile] = useState<File | null>(null);
  const [example, setExample] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);

  function selectFile(candidate: File | null) {
    setExample(null);
    if (!candidate) { setFile(null); setMessage(""); return; }
    if (!/\.pcap(?:ng)?$/i.test(candidate.name)) {
      setFile(null); setMessage("Escolha um arquivo .pcap ou .pcapng."); return;
    }
    if (candidate.size > maxBytes) {
      setFile(null); setMessage("O limite desta interface é 200 MB. Escolha um arquivo menor."); return;
    }
    setFile(candidate); setMessage("Arquivo selecionado no navegador. Ele ainda não foi enviado.");
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0] ?? null);
  }

  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  function prepare() {
    if (!file && !example) {
      setMessage("Selecione uma captura ou um exemplo para continuar.");
      return;
    }
    setMessage("Prévia de interface: o envio e a criação da análise serão conectados ao serviço na próxima etapa. Nenhum arquivo foi enviado.");
  }

  return <main className={styles.page}>
    <section className={styles.hero}>
      <PacketStream />
      <div className={styles.heroCopy}>
        <p className="label-small text-accent">Metadados de pacotes · palpites de modelos</p>
        <h1 className={styles.title}>Veja o que o tráfego revela — e o que não revela.</h1>
        <p className={styles.lede}>Acompanhe como tamanho, direção e intervalo entre pacotes viram uma matriz e três palpites. Sem abrir a carga útil, sem tratar uma previsão como certeza.</p>
        <div className={styles.scienceNote} role="note">Modelos treinados com tráfego do ISCX de 2016. Em capturas atuais, os palpites podem errar mais.</div>
        <a className="ui-button ui-button--secondary" href="#nova-analise">Explorar uma captura <span aria-hidden="true">↓</span></a>
      </div>
    </section>

    <section id="nova-analise" className={styles.inputSection} aria-labelledby="input-title">
      <div>
        <p className="label-small text-text-muted">Nova análise</p>
        <h2 id="input-title" className={styles.sectionTitle}>Escolha por onde começar</h2>
        <p className={styles.supporting}>Use um arquivo próprio ou explore um fluxo já extraído do conjunto ISCX.</p>
      </div>
      <div className={styles.inputGrid}>
        <Card title="Sua captura" icon="↥">
          <label className={styles.dropZone} data-dragging={dragging} htmlFor="capture-file"
            onDragOver={event => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)} onDrop={dropFile}>
            <span className={styles.dropIcon} aria-hidden="true">↥</span>
            <strong>{file ? file.name : "Selecione um arquivo de captura"}</strong>
            <span>.pcap ou .pcapng · até 200 MB</span>
            <input id="capture-file" className="sr-only" type="file" accept=".pcap,.pcapng,application/vnd.tcpdump.pcap" onChange={chooseFile} />
          </label>
          <p className={styles.privacy}>O arquivo original será apagado após a extração. A aplicação guarda metadados dos fluxos e palpites, não a carga útil, IPs ou portas.</p>
          <Button className="mt-4" onClick={prepare}>Continuar com captura</Button>
        </Card>
        <Card title="Um exemplo ISCX" icon="◇">
          <p className={styles.supporting}>Cinco categorias disponíveis. O nome da categoria é herdado da captura do estudo, não uma conferência manual deste fluxo.</p>
          <div className={styles.examples} role="group" aria-label="Escolher categoria de exemplo">
            {examples.map(item => <button key={item.id} type="button" className={styles.example} aria-pressed={example === item.id}
              onClick={() => { setExample(item.id); setFile(null); setMessage(`${item.label} selecionado. O rótulo de referência é herdado da captura ISCX.`); }}>
              <span><strong>{item.label}</strong><small>{item.protocol}</small></span>
              <Chip tone={example === item.id ? "ok" : "neutral"}>{example === item.id ? "Selecionado" : "ISCX"}</Chip>
            </button>)}
          </div>
          <Button variant="secondary" className="mt-4" onClick={prepare}>Continuar com exemplo</Button>
        </Card>
      </div>
      <p className={styles.feedback} role="status" aria-live="polite">{message || "Prévia de interface: as ações ainda não enviam captura nem iniciam processamento."}</p>
    </section>

    <section className={styles.howTo}>
      <Card title="Como gerar um arquivo .pcap">
        <p>Abra a captura no Wireshark e use <strong>Arquivo → Salvar como</strong>. A demonstração não inspeciona o conteúdo da carga útil.</p>
        <Link href="/dev/componentes">Ver como os metadados viram uma explicação →</Link>
      </Card>
    </section>
  </main>;
}
