"use client";

import { useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, CLASSES, NOMES, consultarAnalise, criarExemplo, criarUpload, type Classe } from "@/lib/api";
import s from "@/components/raiox/enviar.module.css";

const MAX_BYTES = 200_000_000;
const mb = (b: number) => `${(b / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

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
    setFile(candidate); setMessage("");
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
    setSubmitting(true); setMessage(kind === "arquivo" ? "Enviando…" : "Preparando o fluxo…");
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

  return <div className={s.page}>
    <header className={s.head}>
      <p className="eyebrow">Nova análise</p>
      <h1 className="display">Coloque suas capturas no raio-X.</h1>
      <p className={s.lead}>Envie um .pcap, um .pcapng ou um .zip com várias capturas. O sistema separa os fluxos, monta as matrizes
        e mostra o palpite dos três modelos para cada um, com os modelos treinados nesta análise do ISCX.</p>
    </header>

    <div className={s.grid}>
      <section aria-labelledby="envio">
        <h2 id="envio" className="sr-only">Enviar arquivo</h2>
        <label className={`${s.drop} registro`} data-dragging={dragging || undefined} data-file={file ? true : undefined} htmlFor="capture-file"
          onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={dropFile}>
          <span className={s.dropGlyph} aria-hidden>{file ? "◼" : "↥"}</span>
          <strong>{file ? file.name : "Arraste o arquivo aqui"}</strong>
          <span className="font-mono">{file ? mb(file.size) : "ou clique para escolher · .pcap · .pcapng · .zip"}</span>
          <input id="capture-file" className="sr-only" type="file" accept=".pcap,.pcapng,.zip,application/vnd.tcpdump.pcap,application/zip" onChange={chooseFile} disabled={submitting} />
        </label>
        <div className={s.row}>
          <button type="button" className="ui-button ui-button--primary" onClick={() => start("arquivo")} disabled={!file || submitting}>
            {submitting ? "Enviando…" : "Iniciar análise"} <span className="ui-button__arrow" aria-hidden>→</span></button>
          {file && !submitting && <button type="button" className="ui-button ui-button--ghost" onClick={() => selectFile(null)}>Trocar arquivo</button>}
        </div>
        <p className={s.feedback} role="status" aria-live="polite">{message}</p>
      </section>

      <aside className={s.side}>
        <dl className={s.limits}>
          <div><dt>Arquivo</dt><dd>até 200 MB</dd></div>
          <div><dt>ZIP</dt><dd>até 20 capturas · 500 MB abertos</dd></div>
          <div><dt>Leitura</dt><dd>até 3 mi de pacotes · 2.000 fluxos</dd></div>
          <div><dt>Palpites</dt><dd>500 fluxos principais</dd></div>
        </dl>
        <p className={s.privacy}><b>Privacidade.</b> O arquivo é apagado logo após a leitura. Ficam só tamanho, direção e tempo dos pacotes e os palpites, por 7 dias. IPs, portas e conteúdo nunca são guardados.</p>
        <p className={s.privacy}><b>Como gerar.</b> No Wireshark: <span className="font-mono">Arquivo → Salvar como</span>, formato pcap ou pcapng.</p>
      </aside>
    </div>

    <section className={s.examples} aria-labelledby="exemplos">
      <div><p className="eyebrow">Sem arquivo à mão?</p><h2 id="exemplos" className={s.h2}>Abra um fluxo do ISCX.</h2></div>
      <div className={s.exampleList} role="group" aria-label="Abrir exemplo">
        {CLASSES.map(name => <button key={name} type="button" className={s.example} disabled={submitting}
          onClick={() => { setFile(null); void start("exemplo", name); }}>
          <i style={{ background: `var(--cat-${name === "transferencia" ? "transf" : name === "streaming" ? "stream" : name})` }} />
          <strong>{NOMES[name]}</strong><span className="font-mono">1 fluxo · ISCX →</span>
        </button>)}
      </div>
    </section>
  </div>;
}
