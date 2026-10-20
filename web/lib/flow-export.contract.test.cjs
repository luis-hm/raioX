const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const filename = require.resolve("./flow-export.ts");
const source = fs.readFileSync(filename, "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = new Module(filename, module);
mod.filename = filename; mod.paths = module.paths;
mod.require = name => name === "./api" ? {
  CLASSES: ["chat", "email", "transferencia", "streaming", "voip"],
  MODELOS: ["B1", "B2", "P"],
  NOMES: { chat: "Chat", email: "E-mail", transferencia: "Transferência", streaming: "Streaming", voip: "VoIP" },
} : Module.prototype.require.call(mod, name);
mod._compile(compiled, filename);

const flow = {
  analise_id: "secret-analysis", n: 7, proto: 6, ini_s: 1.5, duracao_s: 2,
  principal: true, n_pacotes_guardados: 4, bytes_amostra_cliente: 11, bytes_amostra_servidor: 13,
  previsoes: { B1: { classe_prevista: "chat", probabilidades: { chat: 0.75 } },
    B2: { classe_prevista: "email", probabilidades: { email: 0.6 } },
    P: { classe_prevista: "voip", probabilidades: { voip: 0.9 } } },
  estabilidade: { B1: 4, B2: 3, P: 5 }, rotulo_referencia: 1,
  ip: "192.0.2.1", porta: 443, payload: "secret-payload", nome_arquivo: "private.pcap", segredo: "secret",
};
const csv = mod.exports.serializeVisibleFlowsCsv([flow]);
const lines = csv.split("\r\n");
assert.equal(lines.length, 2);
assert.ok(lines[0].startsWith('"numero_fluxo","protocolo"'));
assert.ok(lines[1].includes('"7","TCP","1.5","2","4","24"'));
assert.ok(lines[1].includes('"Chat","0.75","4"'));
assert.ok(!/secret-analysis|192\.0\.2\.1|443|secret-payload|private\.pcap|secret|rotulo_referencia|principal/.test(csv));
assert.ok(lines.every(line => (line.match(/"/g) || []).length % 2 === 0));
const formulaFlow = { ...flow, previsoes: { ...flow.previsoes, B1: { classe_prevista: '=1+1', probabilidades: {} } } };
assert.ok(mod.exports.serializeVisibleFlowsCsv([formulaFlow]).includes("'=1+1"));
const quotedFlow = { ...flow, previsoes: { ...flow.previsoes, B1: { classe_prevista: 'a,"b', probabilidades: {} } } };
assert.ok(mod.exports.serializeVisibleFlowsCsv([quotedFlow]).includes('"a,""b"'));
console.log("Visible flow CSV contract PASS");
