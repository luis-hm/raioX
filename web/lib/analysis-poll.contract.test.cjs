const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const source = fs.readFileSync(file, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new Module(file, module); mod.filename = file; mod.paths = module.paths;
  const originalRequire = mod.require.bind(mod);
  mod.require = name => name.startsWith("./") && fs.existsSync(path.resolve(path.dirname(file), `${name}.ts`))
    ? load(path.resolve(path.dirname(file), `${name}.ts`)) : originalRequire(name);
  cache.set(file, mod.exports);
  mod._compile(compiled, file);
  cache.set(file, mod.exports);
  return mod.exports;
}
const { watchAnalysis } = load(path.resolve(__dirname, "analysis-poll.ts"));
const { ApiError } = load(path.resolve(__dirname, "api.ts"));

async function runSequence(finalState) {
  const states = ["recebida", "extraindo", "classificando", finalState];
  const seen = []; let calls = 0;
  const done = new Promise((resolve, reject) => {
    const stop = watchAnalysis("Abcdef012_34", status => {
      seen.push([status.estado, status.n_pacotes_lidos]);
      if (status.estado === finalState) resolve(stop);
    }, reject, async (id, signal) => {
      assert.equal(id, "Abcdef012_34"); assert.equal(signal.aborted, false);
      const state = states[calls++];
      return { id, estado: state, n_pacotes_lidos: calls * 10 };
    }, 2);
  });
  const stop = await done;
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual(seen, states.map((state, index) => [state, (index + 1) * 10]));
  assert.equal(calls, 4, "estado terminal não deve seguir consultando");
  stop();
}

async function main() {
  await runSequence("pronta");
  await runSequence("erro");
  let calls = 0;
  await new Promise((resolve, reject) => {
    const stop = watchAnalysis("Abcdef012_34", () => reject(new Error("404 não é sucesso")), error => {
      try { assert.equal(error.status, 404); resolve(); } catch (failure) { reject(failure); } finally { stop(); }
    }, async () => { calls++; throw new ApiError(404, "Análise não encontrada"); }, 2);
  });
  assert.equal(calls, 1, "erro de consulta não deve iniciar polling infinito");
  let signal;
  const stop = watchAnalysis("Abcdef012_34", () => {}, () => {}, async (_id, requestSignal) => {
    signal = requestSignal; return new Promise(() => {});
  }, 2);
  stop(); assert.equal(signal.aborted, true);
  console.log("Analysis polling states PASS");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
