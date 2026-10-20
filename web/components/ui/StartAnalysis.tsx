"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PacketStream } from "@/components/motion/PacketStream";
import { Button } from "./Button";
import { Card } from "./Card";
import { ApiError, CLASSES, NOMES, consultarAnalise, criarExemplo, criarUpload, type Classe } from "@/lib/api";
import styles from "@/components/motion/start.module.css";

const MAX_BYTES = 200_000_000;

export function StartAnalysis() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function selectFile(candidate: File | null) {
    if (!candidate) { setFile(null); setMessage(""); return; }
    if (!/\.(?:pcap|pcapng|zip)$/i.test(candidate.name)) { setFile(null); setMessage("Escolha um arquivo .pcap, .pcapng ou .zip."); return; }
    if (candidate.size > MAX_BYTES) { setFile(null); setMessage("O limite é 200 MB. Escolha um arquivo menor."); return; }
    setFile(candidate); setMessage("Arquivo selecionado. Clique em iniciar para enviá-lo.");
  }
  function chooseFile(event: ChangeEvent<HTMLInputElement>) { selectFile(event.target.files?.[0] ?? null); }
  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0] ?? null);
  }
  async function start(kind: "arquivo" | "exemplo", chosen?: Classe) {
    if (submitting) return;
    if (kind === "arquivo" && !file || kind === "exemplo" && !chosen) {
      setMessage("Selecione uma captura ou um exemplo antes de iniciar."); return;
    }
    setSubmitting(true); setMessage(kind === "arquivo" ? "Enviando captura…" : "Criando análise do exemplo…");
    try {
      let created: { id: string };
      if (kind === "arquivo") created = await criarUpload(file!);
      else {
        const cached = window.sessionStorage.getItem(`raiox:example:${chosen}`);
        if (cached && /^[A-Za-z0-9_-]{12}$/.test(cached)) {
          try {
            const status = await consultarAnalise(cached);
            created = status.estado === "erro" ? await criarExemplo(chosen!) : { id: cached };
          } catch (failure) {
            if (!(failure instanceof ApiError) || failure.status !== 404) throw failure;
            created = await criarExemplo(chosen!);
          }
        } else created = await criarExemplo(chosen!);
        window.sessionStorage.setItem(`raiox:example:${chosen}`, created.id);
      }
      if (typeof created.id !== "string" || !/^[A-Za-z0-9_-]{12}$/.test(created.id)) throw new ApiError(0, "O serviço devolveu um identificador inválido.");
      router.push(`/a/${encodeURIComponent(created.id)}`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Não foi possível iniciar. Tente novamente.");
      setSubmitting(false);
    }
  }

  return <div className={styles.page}>
    <section className={styles.hero}>
      <PacketStream />
      <div className={styles.heroCopy}>
        <p className="label-small text-accent">Raio-X do tráfego</p>
        <h1 className={styles.title}>Entenda seus fluxos em um painel.</h1>
        <p className={styles.lede}>Envie uma captura ou um ZIP. Veja onde três modelos concordam, discordam e o que merece investigação.</p>
      </div>
    </section>
    <section id="nova-analise" className={styles.inputSection} aria-labelledby="input-title">
      <div><p className="label-small text-text-muted">Nova análise</p><h2 id="input-title" className={styles.sectionTitle}>Comece com seus dados</h2></div>
      <div className={styles.inputGrid}>
        <Card title="Sua captura ou lote ZIP" icon="↥">
          <label className={styles.dropZone} data-dragging={dragging} htmlFor="capture-file"
            onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={dropFile}>
            <span className={styles.dropIcon} aria-hidden="true">↥</span><strong>{file ? file.name : "Selecione PCAP, PCAPNG ou ZIP"}</strong>
            <span>Até 200 MB enviados · ZIP com até 20 capturas / 500 MB abertos</span>
            <input id="capture-file" className="sr-only" type="file" accept=".pcap,.pcapng,.zip,application/vnd.tcpdump.pcap,application/zip" onChange={chooseFile} disabled={submitting} />
          </label>
          <p className={styles.privacy}>Um ZIP gera um painel combinado. Capturas são apagadas após a leitura; resultados anônimos ficam até 7 dias.</p>
          <Button className="mt-4" onClick={() => start("arquivo")} disabled={!file || submitting}>{submitting ? "Aguarde…" : "Iniciar com captura"}</Button>
        </Card>
        <Card title="Um exemplo ISCX" icon="◇">
          <p className={styles.supporting}>Explore os palpites antes de enviar uma captura.</p>
          <div className={styles.examples} role="group" aria-label="Abrir exemplo">
            {CLASSES.map(name => <button key={name} type="button" className={styles.example} disabled={submitting}
              onClick={() => { setFile(null); void start("exemplo", name); }}>
              <span><strong>{NOMES[name]}</strong><small>1 fluxo · ISCX</small></span><span>Explorar →</span>
            </button>)}
          </div>
          <Link className="ui-button ui-button--secondary mt-4" href="/exemplos">Comparar os 5 exemplos →</Link>
        </Card>
      </div>
      <p className={styles.feedback} role="status" aria-live="polite">{message}</p>
    </section>
    <section className={styles.howTo}><details className="ui-card"><summary className="cursor-pointer text-sm font-semibold">Privacidade, limites e método</summary><p className="mt-3 text-sm text-text-muted">IPs, portas e carga útil não são guardados. O link da análise dá acesso aos metadados. Os modelos são experimentais e seus palpites não são diagnósticos.</p><Link href="/metodologia">Entenda o experimento →</Link></details></section>
  </div>;
}
