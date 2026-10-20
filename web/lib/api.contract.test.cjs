const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");
const { File } = require("node:buffer");

const source = fs.readFileSync(require.resolve("./api.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = new Module(require.resolve("./api.ts"), module);
mod.filename = require.resolve("./api.ts");
mod.paths = module.paths;
mod._compile(compiled, mod.filename);
const api = mod.exports;

async function main() {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.includes("/fluxos?") ? { itens: [], total: 0, pagina: 2, tamanho: 20 } : { id: "Abcdef012_34" } };
  };
  const file = new File([Buffer.from("d4c3b2a1", "hex")], "captura.pcap");
  assert.deepEqual(await api.criarUpload(file), { id: "Abcdef012_34" });
  assert.equal(calls[0].url, "/api/analises");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body.get("arquivo").name, "captura.pcap");
  await api.criarExemplo("transferencia");
  assert.equal(calls[1].url, "/api/analises/exemplo/transferencia");
  await api.consultarAnalise("Abcdef012_34");
  assert.equal(calls[2].url, "/api/analises/Abcdef012_34");
  const list = await api.listarFluxos("Abcdef012_34", { pagina: 2, tamanho: 20, semente: 4, classe: "voip", modelo: "B2", discordam: true, ordem: "ini_s" });
  assert.equal(list.pagina, 2);
  const query = new URL(calls[3].url, "http://test.invalid");
  assert.equal(query.pathname, "/api/analises/Abcdef012_34/fluxos");
  assert.deepEqual(Object.fromEntries(query.searchParams), { pagina: "2", tamanho: "20", semente: "4", modelo: "b2", discordam: "true", ordem: "ini_s", classe: "voip" });
  await api.consultarFluxo("Abcdef012_34", 0, 3);
  assert.equal(calls[4].url, "/api/analises/Abcdef012_34/fluxos/0?semente=3");
  global.fetch = async () => ({ ok: false, status: 404, json: async () => ({ detail: "Análise não encontrada" }) });
  await assert.rejects(api.consultarAnalise("Abcdef012_34"), error => error instanceof api.ApiError && error.status === 404 && error.message === "Análise não encontrada");
  global.fetch = async () => { throw new Error("offline"); };
  await assert.rejects(api.consultarAnalise("Abcdef012_34"), error => error instanceof api.ApiError && error.status === 0 && /conectar/.test(error.message));
  console.log("API client contract PASS");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
