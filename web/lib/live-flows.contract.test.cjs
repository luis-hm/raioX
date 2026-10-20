const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Compile the actual TS/TSX modules and render the actual components.
// Only CSS imports are replaced; no model, adapter or component is stubbed.
const root = path.resolve(__dirname, "..");
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = new Module(file, module);
  cache.set(file, mod);
  mod.filename = file;
  mod.paths = module.paths;
  const originalRequire = mod.require.bind(mod);
  mod.require = spec => {
    if (spec.endsWith(".css")) return {};
    if (spec.startsWith("@/") || spec.startsWith(".")) {
      const target = spec.startsWith("@/") ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(file), spec);
      for (const ext of [".ts", ".tsx", ""]) if (fs.existsSync(target + ext)) return load(target + ext);
    }
    return originalRequire(spec);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, file);
  return mod.exports;
}

const api = load(path.join(__dirname, "api.ts"));
const { toFlowXRay, toRibbonFlows } = load(path.join(__dirname, "flow-adapters.ts"));
const { loadFlowMap } = load(path.join(__dirname, "flow-map.ts"));
const { FlowXRay } = load(path.join(root, "components/motion/FlowXRay.tsx"));
const { FlowRibbons } = load(path.join(root, "components/motion/FlowRibbons.tsx"));
const { animatePacketLadder } = load(path.join(root, "components/motion/PacketLadder.tsx"));
const { animateMatrixGrid } = load(path.join(root, "components/motion/MatrixGrid.tsx"));
const { TimelineScrubber } = load(path.join(root, "components/motion/TimelineScrubber.tsx"));
const { ribbonPage, scrubValue } = load(path.join(root, "components/motion/ribbon-data.ts"));
const { DEMO_FLOW } = load(path.join(root, "components/motion/demo-data.ts"));
const { gsap } = require("gsap");

// Deliberately shuffled probability keys verify the model's category ordering.
const pick = (category = "voip") => ({
  classe_prevista: category,
  probabilidades: { voip: 0.5, streaming: 0.15, chat: 0.05, transferencia: 0.2, email: 0.1 },
});
const predictions = { B1: pick(), B2: pick(), P: pick() };
const flow = {
  analise_id: "Abcdef012_34", n: 27, proto: 17, ini_s: 8, duracao_s: 240,
  principal: true, n_pacotes_guardados: 3, bytes_amostra_cliente: 500, bytes_amostra_servidor: 700,
  pacotes: [[300, 1, 0], [700, -1, 0.5], [200, 1, 1]],
  matriz_32x4: Array.from({ length: 32 }, (_, i) => i < 3 ? [0.2, i, 1, 0] : [0, 0, 0, 0]),
  previsoes: predictions, estabilidade: { B1: 4, B2: 4, P: 4 }, rotulo_referencia: 2,
  previsoes_por_semente: Object.fromEntries([0, 1, 2, 3, 4].map(seed =>
    [seed, seed === 4 ? { B1: pick("chat"), B2: pick("chat"), P: pick("chat") } : predictions])),
};
const explanation = {
  semente: 3, n_pacotes: 3,
  prefixos: [1, 2, 3].map(n_pacotes => ({ n_pacotes, ...predictions })),
  classes_originais_oclusao: { B2: "voip", P: "voip" },
  oclusao_pp: { B2: [12.345, -3.25, 0], P: [6.25, 0, -1.5] },
  aviso: "Exploração de sensibilidade; não mede acerto nem causalidade.",
};
const ok = value => ({ ok: true, json: async () => value });

async function main() {
  // Execute the real animation builders and GSAP on plain targets (no browser).
  // Completed prefixes must reveal exactly the matching arrows and matrix rows.
  for (const count of [3, 7, 32]) {
    const arrows = Array.from({ length: count }, () => ({ scaleX: 1, opacity: 1 }));
    const cells = Array.from({ length: count }, () =>
      Array.from({ length: 4 }, () => ({ opacity: 1, y: 0 })));
    const sequence = gsap.timeline({ paused: true });
    try {
      animatePacketLadder(sequence, { querySelectorAll: () => arrows });
      animateMatrixGrid(sequence, { querySelectorAll: () =>
        cells.map(row => ({ querySelectorAll: () => row })) });
      assert.equal(sequence.duration(), count * 0.32);
      for (const rate of [320 / 650, 1, 320 / 120]) {
        sequence.timeScale(rate);
        for (let prefix = 0; prefix <= count; prefix++) {
          sequence.pause().progress(prefix / count, false);
          assert.equal(sequence.paused(), true);
          arrows.forEach((arrow, i) => assert.equal(arrow.opacity, i < prefix ? 1 : 0));
          cells.forEach((row, i) => row.forEach(cell => assert.equal(cell.opacity, i < prefix ? 1 : 0)));
        }
      }
      sequence.progress(0, false);
      assert.ok(cells.flat().every(cell => cell.opacity === 0), "restart clears the matrix");
      sequence.progress(1, false).pause();
      assert.ok(cells.flat().every(cell => cell.opacity === 1), "reduced-motion final state reveals every cell");
    } finally { sequence.kill(); }
  }
  gsap.ticker.sleep();
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return ok(explanation); };
  const controller = new AbortController();
  const response = await api.explicarFluxo(flow.analise_id, flow.n, 3, controller.signal);
  assert.equal(calls.length, 1, "a single selected seed must make one request");
  assert.equal(calls[0].url, "/api/analises/Abcdef012_34/fluxos/27/explicar?semente=3");
  assert.equal(calls[0].options.signal, controller.signal);
  const data = toFlowXRay(flow, response, 3, "upload");
  assert.deepEqual(Object.keys(data.seeds), ["3"]);
  assert.deepEqual(data.seeds[3].prefixes[0].b1, [0.05, 0.1, 0.2, 0.15, 0.5]);
  assert.deepEqual(data.seeds[3].occlusion.b2, [12.345, -3.25, 0]);
  assert.equal(data.source.kind, "upload", "upload cannot inherit an example reference");
  assert.deepEqual(data.finalStability, { b1: 4, b2: 4, p: 4 });
  assert.equal(data.packets[1].timeSeconds, 0.5);
  assert.deepEqual(data.matrix, flow.matriz_32x4);
  assert.equal(toFlowXRay(flow, response, 3, "exemplo").source.referenceLabel, "transferencia");
  assert.equal(toFlowXRay({ ...flow, previsoes_por_semente: null }, response, 3, "upload").finalStability, undefined);
  const longFlow = { ...flow, n_pacotes_guardados: 100,
    pacotes: Array.from({ length: 100 }, (_, i) => [300, 1, i]),
    matriz_32x4: Array.from({ length: 32 }, () => [0.2, 0, 1, 0]) };
  const longExplanation = { ...response, n_pacotes: 32,
    prefixos: Array.from({ length: 32 }, (_, i) => ({ n_pacotes: i + 1, ...predictions })),
    oclusao_pp: { B2: Array(32).fill(0), P: Array(32).fill(0) } };
  const longData = toFlowXRay(longFlow, longExplanation, 3, "upload");
  assert.equal(longData.packets.length, 100);
  assert.equal(longData.matrix.length, 32);
  assert.equal(longData.seeds[3].prefixes.length, 32);
  const longHtml = renderToStaticMarkup(React.createElement(FlowXRay, { data: longData, seed: 3 }));
  assert.match(longHtml, /Fora do corte/);
  assert.doesNotMatch(longHtml, /Explicação incompleta/);
  assert.throws(() => toFlowXRay(flow, response, 2, "upload"), /semente/);
  assert.throws(() => toFlowXRay(flow, { ...response, prefixos: response.prefixos.slice(1) }, 3, "upload"), /incompleta/);
  assert.throws(() => toFlowXRay(flow, { ...response, oclusao_pp: { B2: [], P: [] } }, 3, "upload"), /incompleta/);
  // Anything rejected by the renderer must be rejected before LiveXRay caches it.
  for (const matrix of [
    flow.matriz_32x4.slice(0, 31),
    flow.matriz_32x4.map((row, i) => i === 0 ? [0.2, 0, 0, 0] : row),
    flow.matriz_32x4.map((row, i) => i === 0 ? [0.2, 0, 1, 1] : row),
    flow.matriz_32x4.map((row, i) => i === 31 ? [0.2, 0, 0, 0] : row),
    flow.matriz_32x4.map((row, i) => i === 0 ? [1.01, 0, 1, 0] : row),
    flow.matriz_32x4.map((row, i) => i === 0 ? [-1.01, 0, 1, 0] : row),
    flow.matriz_32x4.map((row, i) => i === 0 ? [0.2, -0.1, 1, 0] : row),
  ]) {
    assert.throws(() => toFlowXRay({ ...flow, matriz_32x4: matrix }, response, 3, "upload"), /Matriz/);
    const invalid = renderToStaticMarkup(React.createElement(FlowXRay, { data: { ...data, matrix }, seed: 3 }));
    assert.match(invalid, /Explicação incompleta/, "standalone renderer also rejects invalid matrix channels");
  }
  for (const packets of [
    [[300, 1, 0], [700, -1, -0.5], [200, 1, 1]],
    [[300, 1, 0], [700, -1, 1], [200, 1, 0.5]],
    [[0, 1, 0], [700, -1, 0.5], [200, 1, 1]],
  ]) {
    assert.throws(() => toFlowXRay({ ...flow, pacotes: packets }, response, 3, "upload"), /Pacotes/);
  }
  const html = renderToStaticMarkup(React.createElement(FlowXRay, { data, seed: 3 }));
  assert.match(html, /Metadados da análise real/);
  assert.match(html, /12,3 pp/);
  assert.match(html, /-3,3 pp/);
  assert.match(html, /B1 4\/5/);
  assert.match(html, /B2, 3 pacotes: VoIP/);
  assert.match(html, /Não demonstra causalidade/);
  assert.doesNotMatch(html, /Demonstração ilustrativa|Explicação incompleta/);
  assert.match(renderToStaticMarkup(React.createElement(FlowXRay, { data: DEMO_FLOW })), /Demonstração ilustrativa/);
  for (const status of ["loading", "error"]) {
    const state = renderToStaticMarkup(React.createElement(FlowXRay, { data: null, status, seed: 4, onRetry() {} }));
    assert.match(state, /Semente 4/);
    assert.match(state, status === "loading" ? /Preparando o raio-X/ : /Tentar novamente/);
  }

  const converted = toRibbonFlows([flow, { ...flow, n: 28, duracao_s: null }, { ...flow, n: 29, duracao_s: 0 }]);
  assert.equal(converted.omittedDuration, 1);
  assert.equal(converted.ribbons.length, 2, "zero duration is known and must not be omitted");
  assert.equal(converted.ribbons[0].durationSeconds, 240, "do not substitute the last stored packet's time");
  assert.equal(converted.ribbons[0].startSeconds, 8);
  assert.equal(converted.ribbons[0].sampleBytes, 1200);
  assert.equal(converted.ribbons[0].predictions.p.category, "voip");
  const ribbons = renderToStaticMarkup(React.createElement(FlowRibbons, { flows: converted.ribbons, model: "p", seed: 3 }));
  assert.match(ribbons, /240/);
  assert.match(ribbons, /além dos 100 guardados/);
  assert.doesNotMatch(ribbons, /Demonstração:/);
  const visualFlows = Array.from({ length: 20 }, (_, n) => ({ ...converted.ribbons[0], n, startSeconds: n }));
  assert.deepEqual(ribbonPage(visualFlows, Infinity, 1).flows.map(item => item.n), [8, 9, 10, 11, 12, 13, 14, 15]);
  assert.equal(ribbonPage(visualFlows, 2, 2).page, 0, "a shorter cutoff clamps the visual page");
  assert.deepEqual(ribbonPage(visualFlows, 2, 0).flows.map(item => item.n), [0, 1, 2]);
  assert.equal(scrubValue(0, 0, 0, 0.1), 0);
  assert.equal(scrubValue(1.25, 0, 1.25, 0.1), 1.25, "End must include the exact observed extent");
  const scrubber = renderToStaticMarkup(React.createElement(TimelineScrubber, { value: 1.25, max: 1.25, onChange() {} }));
  assert.match(scrubber, /role="slider"/);
  assert.match(scrubber, /aria-valuemax="1.25"/);
  assert.match(scrubber, /tabindex="0"/);
  assert.match(scrubber, /aria-labelledby=/);
  for (const invalid of [
    { ini_s: -1 }, { ini_s: NaN }, { duracao_s: -1 }, { duracao_s: Infinity },
    { proto: 1 }, { n_pacotes_guardados: 101 }, { bytes_amostra_cliente: -1 },
    { bytes_amostra_servidor: NaN },
  ]) {
    assert.throws(() => toRibbonFlows([{ ...flow, ...invalid }]), /Metadados/);
  }

  calls.length = 0;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    const page = Number(new URL(url, "http://test.invalid").searchParams.get("pagina"));
    return ok({ pagina: page, tamanho: 100, total: 620, itens: Array.from({ length: 100 }, (_, i) =>
      ({ ...flow, n: (page - 1) * 100 + i, duracao_s: i === 0 ? null : 240 })) });
  };
  const map = await loadFlowMap(flow.analise_id, { semente: 3, modelo: "P", classe: "voip", discordam: true }, controller.signal);
  assert.equal(calls.length, 5);
  assert.equal(map.loaded, 500);
  assert.equal(map.notLoaded, 120);
  assert.equal(map.omittedDuration, 5);
  assert.equal(map.ribbons.length, 495);
  calls.forEach(({ url, options }, index) => {
    const query = new URL(url, "http://test.invalid").searchParams;
    assert.equal(query.get("pagina"), String(index + 1));
    assert.equal(query.get("semente"), "3");
    assert.equal(query.get("tamanho"), "100");
    assert.equal(query.get("classe"), "voip");
    assert.equal(query.get("discordam"), "true");
    assert.equal(options.signal, controller.signal);
  });
  // A partial final page is valid; duplicated, mismatched or oversized pages are not.
  const pageItems = (page, count = 100) => Array.from({ length: count }, (_, i) =>
    ({ ...flow, n: (page - 1) * 100 + i }));
  global.fetch = async url => {
    const page = Number(new URL(url, "http://test.invalid").searchParams.get("pagina"));
    return ok({ pagina: page, tamanho: 100, total: 103, itens: pageItems(page, page === 1 ? 100 : 3) });
  };
  const partial = await loadFlowMap(flow.analise_id, { semente: 3, modelo: "P", discordam: false }, controller.signal);
  assert.equal(partial.loaded, 103);
  assert.equal(partial.notLoaded, 0);
  for (const corrupt of [
    page => ({ pagina: 1, tamanho: 100, total: 200, itens: pageItems(page) }),
    page => ({ pagina: page, tamanho: 100, total: 200, itens: pageItems(1) }),
    page => ({ pagina: page, tamanho: 100, total: page === 1 ? 200 : 201, itens: pageItems(page) }),
    page => ({ pagina: page, tamanho: 100, total: 200, itens: pageItems(page, 101) }),
    page => ({ pagina: page, tamanho: 100, total: -1, itens: [] }),
    page => ({ pagina: page, tamanho: 100, total: 1, itens: [{ ...flow, analise_id: "outra-analise" }] }),
  ]) {
    global.fetch = async url => ok(corrupt(Number(new URL(url, "http://test.invalid").searchParams.get("pagina"))));
    await assert.rejects(loadFlowMap(flow.analise_id, { semente: 3, modelo: "P", discordam: false }, controller.signal), /Página/);
  }
  global.fetch = async () => ok({ itens: [], total: 0, pagina: 1, tamanho: 100 });
  const empty = await loadFlowMap(flow.analise_id, { semente: 0, modelo: "P", discordam: false }, controller.signal);
  assert.equal(empty.loaded, 0);
  assert.equal(empty.omittedDuration, 0);
  global.fetch = async () => ok({ itens: [], total: 10, pagina: 1, tamanho: 100 });
  await assert.rejects(loadFlowMap(flow.analise_id, { semente: 0, modelo: "P", discordam: false }, controller.signal), /Página incompleta/);
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: "Serviço indisponível" }) });
  await assert.rejects(api.explicarFluxo(flow.analise_id, 27, 3), /Serviço indisponível/);
  await assert.rejects(loadFlowMap(flow.analise_id, { semente: 0, modelo: "P", discordam: false }, controller.signal), /Serviço indisponível/);

  const cancelled = new AbortController();
  cancelled.abort();
  global.fetch = async () => { throw new Error("An already cancelled map must not request a page"); };
  await assert.rejects(loadFlowMap(flow.analise_id, { semente: 0, modelo: "P", discordam: false }, cancelled.signal), { name: "AbortError" });
  const cancelledDuringLoad = new AbortController();
  let pages = 0;
  global.fetch = async () => {
    pages++; cancelledDuringLoad.abort();
    return ok({ itens: Array.from({ length: 100 }, () => flow), total: 300, pagina: 1, tamanho: 100 });
  };
  await assert.rejects(loadFlowMap(flow.analise_id, { semente: 0, modelo: "P", discordam: false }, cancelledDuringLoad.signal), { name: "AbortError" });
  assert.equal(pages, 1, "abort must prevent requesting a second page");
  global.fetch = async () => { throw cancelled.signal.reason; };
  await assert.rejects(api.explicarFluxo(flow.analise_id, 27, 3, cancelled.signal), { name: "AbortError" });

  // Exercise the frontend proxy, including its fourth path segment and seed query.
  const { NextRequest } = require("next/server");
  const proxy = load(path.join(root, "app/api/analises/[[...path]]/route.ts"));
  let upstream;
  global.fetch = async (url, options) => {
    upstream = { url: String(url), options };
    return Response.json(explanation);
  };
  const request = new NextRequest("http://test.invalid/api/analises/Abcdef012_34/fluxos/27/explicar?semente=3");
  const result = await proxy.GET(request, { params: Promise.resolve({ path: ["Abcdef012_34", "fluxos", "27", "explicar"] }) });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), explanation);
  assert.match(upstream.url, /\/fluxos\/27\/explicar\?semente=3$/);
  assert.equal(upstream.options.signal, request.signal);
  const invalid = await proxy.GET(request, { params: Promise.resolve({ path: ["Abcdef012_34", "fluxos", "27", "unknown"] }) });
  assert.equal(invalid.status, 404);
  console.log("Live flow contract PASS: selected seed, API → XRay rendering, demo, duration, paginated map, abort, errors and proxy.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
