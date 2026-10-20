const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Render real TSX with React; replace CSS imports only.
const root = path.resolve(__dirname, "..");
const cache = new Map();
function load(file) {
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
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const { selectPacketLoss, LOSS_LEVELS } = load(path.join(root, "components/motion/packet-loss.ts"));
const { toFlowXRay } = load(path.join(__dirname, "flow-adapters.ts"));
const { FlowXRay } = load(path.join(root, "components/motion/FlowXRay.tsx"));

// Frozen API input: selection must not modify the received packets, matrix,
// stored predictions, explanations or reference labels.
const pick = { classe_prevista: "voip",
  probabilidades: { chat: 0.05, email: 0.1, transferencia: 0.2, streaming: 0.15, voip: 0.5 } };
const predictions = { B1: pick, B2: pick, P: pick };
const flow = freeze({
  n: 27, proto: 17, principal: true, rotulo_referencia: 4,
  pacotes: Array.from({ length: 100 }, (_, i) => [300 + i, i % 2 ? -1 : 1, i / 10]),
  matriz_32x4: Array.from({ length: 32 }, (_, i) => [0.2, i, 1, 0]),
  previsoes_por_semente: Object.fromEntries([0, 1, 2, 3, 4].map(seed => [seed, predictions])),
});
const explanation = freeze({
  semente: 3, n_pacotes: 32,
  prefixos: Array.from({ length: 32 }, (_, i) => ({ n_pacotes: i + 1, ...predictions })),
  classes_originais_oclusao: { B2: "voip", P: "voip" },
  oclusao_pp: { B2: Array(32).fill(12.345), P: Array(32).fill(-3.25) },
  aviso: "Exploração local dos modelos.",
});
const original = JSON.stringify([flow, explanation]);
global.fetch = () => { throw new Error("Simulation must never call the API"); };
for (const name of ["localStorage", "sessionStorage", "indexedDB"]) {
  Object.defineProperty(global, name, { configurable: true, get() { throw new Error("No persistence"); } });
}

const packets = freeze(toFlowXRay(flow, explanation, 3, "upload").packets);
for (const length of [0, 1, 3, 5, 24, 32, 33, 100]) {
  for (const seed of [0, 1, 2, 3, 4]) {
    let previousLoss = [];
    for (const level of LOSS_LEVELS) {
      const input = freeze(packets.slice(0, length));
      const result = selectPacketLoss(27, input, seed, level);
      assert.deepEqual(result, selectPacketLoss(27, structuredClone(input), seed, level));
      assert.equal(result.lostIndices.length, Math.round(length * level / 100));
      assert.equal(result.retainedIndices.length + result.lostIndices.length, length);
      assert.deepEqual([...result.lostIndices, ...result.retainedIndices].sort((a, b) => a - b),
        Array.from({ length }, (_, i) => i));
      assert.deepEqual(result.lostIndices, [...result.lostIndices].sort((a, b) => a - b));
      previousLoss.forEach(index => assert.ok(result.lost[index], "higher levels keep previous losses"));
      result.retainedIndices.forEach(index => assert.equal(result.lost[index], false));
      previousLoss = result.lostIndices;
    }
  }
}
const base = selectPacketLoss(27, packets, 0, 20);
assert.notDeepEqual(base, selectPacketLoss(28, packets, 0, 20), "flow affects selection");
assert.notDeepEqual(base, selectPacketLoss(27, packets, 1, 20), "visual seed affects selection");
assert.notDeepEqual(base, selectPacketLoss(27, packets.map(p => ({ ...p, bytes: p.bytes + 1 })), 0, 20));
assert.ok(base.lostIndices.some(index => index >= 32), "selection covers packets beyond the model cut");
for (const [seed, level] of [[5, 10], [-1, 10], [0.5, 10], [0, 15], [0, NaN], [0, -10], [0, 101]]) {
  assert.throws(() => selectPacketLoss(27, packets, seed, level), /inválidos/);
}
assert.throws(() => selectPacketLoss(27, [...packets, packets[0]], 0, 10), /inválidos/);
assert.throws(() => selectPacketLoss(27, [{ ...packets[0], timeSeconds: NaN }], 0, 10), /inválidos/);

for (const origin of ["upload", "exemplo"]) {
  const data = freeze(toFlowXRay(flow, explanation, 3, origin));
  const before = JSON.stringify(data);
  const render = lossSimulation => renderToStaticMarkup(React.createElement(FlowXRay, { data, seed: 3, lossSimulation }));
  const inactive = render({ enabled: false, level: 20, seed: 0 });
  assert.match(inactive, /Simulação desativada/);
  assert.doesNotMatch(inactive, /Perdido \(simulação\)/);
  for (const level of LOSS_LEVELS) {
    for (const seed of [0, 4]) {
      const html = render({ enabled: true, level, seed });
      const selected = selectPacketLoss(data.flowNumber, data.packets, seed, level);
      assert.match(html, /type="checkbox"[^>]*checked=""/);
      for (const value of LOSS_LEVELS) assert.match(html, new RegExp(`value="${value}"[^>]*>${value}%`));
      assert.match(html, /Semente da simulação/);
      assert.match(html, /aria-describedby=/);
      assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
      assert.match(html, /somente visual/);
      assert.match(html, /Os palpites e a matriz publicados na tela permanecem os da entrada original/);
      assert.match(html, /Os fluxos não são reclassificados/);
      assert.match(html, /intervalos, prefixos e oclusões não são recalculados/);
      assert.match(html, /resultados publicados do C4 permanecem imutáveis e separados/);
      assert.match(html, /Nada é persistido ou enviado à API/);
      assert.match(html, /Matriz 32 × 4 · entrada original/);
      assert.match(html, /Palpites da entrada original/);
      assert.match(html, /Oclusão · entrada original, sem simulação/);
      assert.match(html, /12,3 pp/);
      assert.match(html, /-3,3 pp/);
      assert.equal((html.match(/Perdido \(simulação\)/g) || []).length, selected.lostIndices.length);
      assert.equal((html.match(/Retido \(simulação\)/g) || []).length, selected.retainedIndices.length);
      assert.equal((html.match(/<li[^>]*data-loss="true"/g) || []).length, selected.lost.slice(0, 32).filter(Boolean).length);
      assert.match(html, new RegExp(`Amostra: ${100 - level} retidos · ${level} perdidos de 100`));
      assert.match(html, origin === "upload" ? /Sem rótulo de referência para medir acerto/ : /Referência herdada da captura/);
      assert.doesNotMatch(html, /macro-F1\s*(?:simulado)?\s*[:=]?\s*\d|acurácia simulada|acertaria|erraria/);
      // Every original matrix cell and prefix table probability source survives.
      const matrix = markup => markup.match(/<table><caption class="sr-only">Matriz[\s\S]*?<\/table>/)?.[0];
      assert.ok(matrix(html), "render the actual matrix, not an empty comparison");
      assert.equal(matrix(html), matrix(inactive));
      assert.equal(JSON.stringify(data), before);
    }
  }
  assert.equal(render({ enabled: false, level: 20, seed: 0 }), inactive, "disabling restores the original view");
}
assert.equal(JSON.stringify([flow, explanation]), original);
require("gsap").gsap.ticker.sleep();
console.log("Packet loss contract PASS: pure deterministic selection, 0/10/20%, frozen API data, upload/example screen semantics and no I/O.");
