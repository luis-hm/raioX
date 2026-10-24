"""Aceite estático da casca acessível e dos tokens do frontend."""

from pathlib import Path
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


class TestRaioXInterface(unittest.TestCase):
    def test_exemplo_abre_caso_direto_com_evolucao(self):
        """Exemplo abre em um clique, sem painel agregado nem 100% sobre n=1 @spec:AC-028"""
        start = (WEB / "components" / "ui" / "StartAnalysis.tsx").read_text(encoding="utf-8")
        view = (WEB / "components" / "ui" / "AnalysisView.tsx").read_text(encoding="utf-8")
        case = (WEB / "components" / "ui" / "ExampleExperience.tsx").read_text(encoding="utf-8")
        self.assertIn('void start("exemplo", name)', start)
        self.assertNotIn("Iniciar com exemplo</Button>", start)
        self.assertIn('analysis.origem === "exemplo"', view)
        self.assertIn("<ExamplePanel analysis={analysis}", view)
        self.assertIn("<ModelPicks flow={flow} prefix={selected}", case)
        self.assertIn('type="range"', case)
        self.assertIn("explanation?.prefixos[step - 1]", case)
        self.assertIn("<details", case)
        self.assertIn("Rótulo herdado da captura ISCX", case)
        self.assertNotIn("100%", case)

    def test_comparacao_usa_cinco_exemplos_reais_e_preserva_upload(self):
        """Comparação consulta API por exemplo e mantém painel agregado para upload @spec:AC-029"""
        comparison = (WEB / "components" / "ui" / "ExampleExperience.tsx").read_text(encoding="utf-8")
        view = (WEB / "components" / "ui" / "AnalysisView.tsx").read_text(encoding="utf-8")
        route = (WEB / "app" / "exemplos" / "page.tsx").read_text(encoding="utf-8")
        self.assertIn("for (const name of CLASSES)", comparison)
        self.assertIn("const created = criarExemplo(name)", comparison)
        self.assertIn("watchAnalysis(analysisId", comparison)
        self.assertIn("listarFluxos(analysisId, initialFilter)", comparison)
        self.assertIn("{MODELOS.map(model =>", comparison)
        self.assertIn("/5 sementes", comparison)
        self.assertIn("não uma medição de acurácia", comparison)
        self.assertIn("<LivePanel analysis={analysis}", view)
        self.assertIn("<ExampleComparison", route)

    def test_ac_027_readme_publico_apresenta_app_e_aponta_para_documentacao(self):
        """README raiz guia instalação, uso e limites @spec:AC-027"""
        readme = (ROOT / "README.md").read_text(encoding="utf-8").lower()
        self.assertTrue((ROOT / "docs" / "SISTEMA.md").is_file())
        self.assertTrue((ROOT / "docs" / "DESIGN.md").is_file())
        for section in (
            "## o que você pode fazer", "## arquitetura", "## início rápido com docker",
            "## desenvolvimento e testes", "## privacidade, limites e uso responsável",
            "## estado do projeto e resultados",
        ):
            self.assertIn(section, readme)
        self.assertIn("docs/sistema.md", readme)
        self.assertIn("docs/design.md", readme)

    def test_sparkline_title_eh_um_texto_unico_estavel_na_hidratacao(self):
        sparkline = (WEB / "components" / "motion" / "Sparkline.tsx").read_text(encoding="utf-8")
        self.assertIn('const title = `${label}: ${values.join(", ")}`;', sparkline)
        self.assertIn("<title id={id}>{title}</title>", sparkline)
        self.assertNotIn("<title id={id}>{label}:", sparkline)

    def test_t024_simulacao_visual_deterministica_preserva_entrada(self):
        """Perda local preserva API e identifica entrada original na tela @spec:AC-023"""
        result = subprocess.run(
            ["node", str(WEB / "lib" / "packet-loss.contract.test.cjs")], cwd=WEB,
            text=True, capture_output=True, timeout=30, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_t022_concordancia_par_a_par_usa_dados_da_semente_e_nao_rotulos(self):
        """Tabela viva depende do resumo par a par @spec:AC-023, com ressalva científica."""
        panel = (WEB / "components" / "ui" / "LivePanel.tsx").read_text(encoding="utf-8")
        api = (WEB / "lib" / "api.ts").read_text(encoding="utf-8")
        self.assertIn("summary?.concordancia_pares", panel)
        self.assertIn('"B1_B2", "B1 × B2"', panel)
        self.assertIn('"B1_P", "B1 × P"', panel)
        self.assertIn('"B2_P", "B2 × P"', panel)
        self.assertIn("concordância não mede acurácia", panel)
        self.assertIn('summary?.concordancia?.todos', panel)
        self.assertIn('concordancia_pares?: Record<"B1_B2" | "B1_P" | "B2_P"', api)

    def test_ac_015_shell_tokens_acessibilidade_e_responsividade(self):
        """Shell aplica tokens do DESIGN, foco visível e layout responsivo @spec:AC-015"""
        css = (WEB / "app" / "globals.css").read_text(encoding="utf-8")
        config = (WEB / "tailwind.config.ts").read_text(encoding="utf-8")
        shell = (WEB / "components" / "ui" / "AppShell.tsx").read_text(encoding="utf-8")

        tokens = {
            "bg": "#0A0F14", "surface": "#111820", "surface-2": "#161F29",
            "border": "#223040", "border-strong": "#2F4255", "text": "#E6EDF3",
            "text-muted": "#8B9BAB", "text-faint": "#5B6B7B", "accent": "#22D3EE",
            "accent-2": "#7C5CFF", "up": "#2DD4BF", "down": "#A78BFA",
            "b1": "#FB923C", "b2": "#94A3B8", "p": "#38BDF8",
            "cat-chat": "#60A5FA", "cat-email": "#FBBF24", "cat-transf": "#34D399",
            "cat-stream": "#F472B6", "cat-voip": "#C084FC", "ok": "#22C55E",
            "warn": "#F59E0B", "bad": "#EF4444",
        }
        for token, value in tokens.items():
            self.assertRegex(css, rf"--{re.escape(token)}:\s*{re.escape(value)}\s*;")
            self.assertRegex(config, rf'(?:"{re.escape(token)}"|\b{re.escape(token)}): "var\(--{re.escape(token)}\)"')

        for token in ("--bg-grid", "--surface-glass", "--font-archivo", "--font-plex-mono",
                      "--card-gap", "--card-padding", "--radius-card", "--radius-control",
                      "--radius-chip", "--label-tracking", "--active-glow"):
            self.assertIn(token, css)
        self.assertIn('"Archivo Variable"', css)
        self.assertIn('"IBM Plex Mono"', css)
        self.assertIn(":focus-visible", css)
        self.assertIn("prefers-reduced-motion: reduce", css)
        self.assertIn("max-width: 1440px", css)
        self.assertIn("max-width: 639px", css)
        self.assertIn("padding-inline: max(16px", css)
        self.assertIn('href="#conteudo"', shell)
        self.assertIn('aria-label="Navegação principal"', shell)
        self.assertIn('aria-current=', shell)

        # AC-015: text on the highlighted button must remain legible with its
        # actual token colors, including when the palette is adjusted later.
        highlight = re.search(r"\.ui-button--highlight\s*\{([^}]+)\}", css)
        self.assertIsNotNone(highlight)
        declarations = dict(re.findall(r"([\w-]+):\s*([^;]+);", highlight.group(1)))

        def luminance(color):
            channels = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
            linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4
                      for channel in channels]
            return sum(channel * weight for channel, weight in zip(linear, (0.2126, 0.7152, 0.0722)))

        def resolved_color(property_name):
            token = re.fullmatch(r"var\(--([\w-]+)\)", declarations[property_name].strip())
            self.assertIsNotNone(token)
            return tokens[token.group(1)]

        lighter, darker = sorted((luminance(resolved_color("color")), luminance(resolved_color("background"))), reverse=True)
        self.assertGreaterEqual((lighter + 0.05) / (darker + 0.05), 4.5)

        for component in (WEB / "components" / "ui").glob("*.tsx"):
            source = component.read_text(encoding="utf-8")
            self.assertIsNone(re.search(r"#[0-9A-Fa-f]{3,8}\b", source), component.name)

    def test_demo_raio_x_sintetico_sincroniza_dados_e_limita_afirmacoes(self):
        """Demonstração mantém timeline única e identifica seus dados sintéticos."""
        motion = WEB / "components" / "motion"
        flow = (motion / "FlowXRay.tsx").read_text(encoding="utf-8")
        ladder = (motion / "PacketLadder.tsx").read_text(encoding="utf-8")
        matrix = (motion / "MatrixGrid.tsx").read_text(encoding="utf-8")
        bars = (motion / "ProbBars.tsx").read_text(encoding="utf-8")
        demo = (motion / "demo-data.ts").read_text(encoding="utf-8")
        route = (WEB / "app" / "a" / "[id]" / "fluxo" / "[n]" / "page.tsx").read_text(encoding="utf-8")

        self.assertIn("gsap.timeline({ paused: true })", flow)
        self.assertIn("animatePacketLadder(sequence, ladder.current!)", flow)
        self.assertIn("animateMatrixGrid(sequence, matrix.current!)", flow)
        self.assertIn("prefers-reduced-motion: reduce", flow)
        self.assertIn("sequence.progress(reduce ? 1 : 0, false)", flow)
        self.assertIn('value="slow"', flow)
        self.assertIn('value="normal"', flow)
        self.assertIn('value="fast"', flow)
        self.assertIn("Exploração por prefixos", flow)
        self.assertIn('(["b2", "p"] as const)', flow)
        self.assertIn("Não é uma verificação manual deste fluxo", flow)
        self.assertIn("Demonstração ilustrativa", flow)
        self.assertIn("sintéticos", flow)
        self.assertIn("timeline: gsap.core.Timeline", ladder)
        self.assertIn("timeline: gsap.core.Timeline", matrix)
        self.assertIn('from "motion/react"', bars)
        self.assertIn("Synthetic, deterministic fixtures", demo)
        self.assertIn("FlowDetails", route)
        self.assertNotIn("DEMO_FLOW", route)
        self.assertNotRegex(flow + ladder + matrix + bars, r"\b(?:src|dst)IP\b|\b(?:source|destination)_ip\b")

    def test_ac_016_inicio_explica_entrada_privacidade_e_limite_da_integracao(self):
        """Início descreve formatos e privacidade sem fingir a integração da captura."""
        start = (WEB / "components" / "motion" / "StartExperience.tsx").read_text(encoding="utf-8")
        stream = (WEB / "components" / "motion" / "PacketStream.tsx").read_text(encoding="utf-8")
        page = (WEB / "app" / "page.tsx").read_text(encoding="utf-8")

        self.assertIn('accept=".pcap,.pcapng,application/vnd.tcpdump.pcap"', start)
        self.assertIn("maxBytes = 200_000_000", start)
        self.assertIn("onDrop={dropFile}", start)
        self.assertIn('data-dragging={dragging}', start)
        self.assertIn("O arquivo original será apagado após a extração", start)
        self.assertIn("não a carga útil, IPs ou portas", start)
        self.assertIn("rótulo de referência é herdado da captura ISCX", start)
        for category in ("chat", "email", "transferencia", "streaming", "voip"):
            self.assertIn(f'id: "{category}"', start)
        self.assertIn("Modelos treinados com tráfego do ISCX de 2016", start)
        self.assertIn("Nenhum arquivo foi enviado", start)
        self.assertIn("<StartAnalysis", page)
        self.assertIn("gsap.ticker.add(paint)", stream)
        self.assertIn("prefers-reduced-motion: reduce", stream)
        self.assertIn('aria-hidden="true"', stream)
        self.assertIn("--up", stream)
        self.assertIn("--down", stream)

    def test_ac_017_processamento_comunica_etapas_contadores_e_erro(self):
        """Estados de processamento apresentam texto e contadores além do movimento."""
        pipeline = (WEB / "components" / "motion" / "ProcessingPipeline.tsx").read_text(encoding="utf-8")
        demo = (WEB / "components" / "motion" / "ProcessingDemo.tsx").read_text(encoding="utf-8")
        route = (WEB / "app" / "a" / "[id]" / "page.tsx").read_text(encoding="utf-8")
        css = (WEB / "components" / "motion" / "processing.module.css").read_text(encoding="utf-8")

        for status in ("recebida", "extraindo", "classificando", "pronta", "erro"):
            self.assertIn(f'"{status}"', pipeline)
            self.assertIn(f'"{status}"', demo)
        self.assertIn('role="progressbar"', pipeline)
        self.assertIn('aria-busy={status !== "pronta"}', pipeline)
        self.assertIn("Pacotes lidos", pipeline)
        self.assertIn("Fluxos encontrados", pipeline)
        self.assertIn("não estimamos valores ausentes", pipeline)
        self.assertIn("Nenhum palpite foi produzido", pipeline)
        self.assertIn("prefers-reduced-motion: reduce", pipeline)
        self.assertIn("<AnalysisView", route)
        live = (WEB / "components" / "ui" / "AnalysisView.tsx").read_text(encoding="utf-8")
        self.assertNotIn('role="progressbar"', live)
        self.assertIn("Pacotes lidos", live)
        self.assertIn("Estado ilustrativo", pipeline)
        self.assertIn("@media (max-width: 480px)", css)

    def test_demo_painel_filtra_fluxos_sem_afirmar_acuracia(self):
        """Painel demonstrativo identifica fluxos sintéticos e não afirma acurácia."""
        panel = (WEB / "components" / "ui" / "PanelDemo.tsx").read_text(encoding="utf-8")
        fixture = (WEB / "lib" / "panel-demo.ts").read_text(encoding="utf-8")
        page = (WEB / "app" / "a" / "[id]" / "page.tsx").read_text(encoding="utf-8")
        ribbons = (WEB / "components" / "motion" / "FlowRibbons.tsx").read_text(encoding="utf-8")
        scrubber = (WEB / "components" / "motion" / "TimelineScrubber.tsx").read_text(encoding="utf-8")
        ribbon_fixture = (WEB / "components" / "motion" / "ribbon-demo.ts").read_text(encoding="utf-8")

        self.assertIn("todos os números, fluxos, classes e probabilidades desta página são sintéticos", panel)
        self.assertIn("Nenhuma captura foi analisada aqui", panel)
        for label in ("Pacotes lidos", "Fluxos principais", "Duração observada", "Concordância entre modelos",
                      "Distribuição dos palpites", "Estabilidade entre sementes", "Leitura do resultado"):
            self.assertIn(label, panel)
        self.assertIn("SEEDS.map", panel)
        self.assertIn("MODELS.map", panel)
        self.assertIn("filterFlows(DEMO_FLOWS, seed, model, category, disagreementsOnly)", panel)
        self.assertIn("Só onde discordam", panel)
        self.assertIn("Nenhum fluxo sintético corresponde aos filtros", panel)
        self.assertIn("Concordância entre palpites não mede acerto", panel)
        self.assertIn("Os tempos ilustrativos do mapa são sintéticos", panel)
        self.assertIn("/fluxo/${flow.n}", panel)
        self.assertIn("?aba=${name}", panel)
        self.assertIn('requestedTab === "fluxos" || requestedTab === "mapa"', page)
        self.assertIn("modelsAgree(flow, seed)", fixture)
        self.assertIn("seedStability(flow: DemoFlow, model: Model, seed: Seed)", fixture)
        self.assertIn("category === \"all\" || flow.bySeed[seed][model].classe === category", fixture)
        self.assertIn("Padrões temporais anônimos", ribbons)
        self.assertIn("sem geografia, hosts, IPs, portas ou topologia inferida", ribbons)
        self.assertIn("prefers-reduced-motion: no-preference", ribbons)
        self.assertIn('data-initial={shape.initialPath}', ribbons)
        self.assertIn('data-final={shape.path}', ribbons)
        self.assertIn('role="slider"', scrubber)
        self.assertIn('onKeyDown=', scrubber)
        self.assertIn("Synthetic temporal fixtures only", ribbon_fixture)
        self.assertIn("FlowRibbons flows={ribbons}", panel)
        self.assertNotRegex(panel, r"#[0-9A-Fa-f]{3,8}\b")

    def test_ac_016_021_cliente_envia_formato_correto_e_trata_erros(self):
        """Cliente cria uploads/exemplos e consulta filtros reais, 404 e falha de rede @spec:AC-016 @spec:AC-021"""
        result = subprocess.run(
            ["node", str(WEB / "lib" / "api.contract.test.cjs")], cwd=WEB,
            text=True, capture_output=True, timeout=30, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_t023_exporta_apenas_fluxos_visiveis_com_acao_acessivel(self):
        """Exportação do painel usa a página carregada @spec:AC-023 e campos anonimizados."""
        panel = (WEB / "components" / "ui" / "LivePanel.tsx").read_text(encoding="utf-8")
        contract = (WEB / "lib" / "flow-export.contract.test.cjs").read_text(encoding="utf-8")
        self.assertIn("CSV desta página", panel)
        self.assertIn("downloadVisibleFlowsCsv(flows.itens)", panel)
        self.assertIn('disabled={flows.itens.length === 0}', panel)
        self.assertNotIn("listarFluxos", (WEB / "lib" / "flow-export.ts").read_text(encoding="utf-8"))
        self.assertIn('anchor.download = "fluxos.csv"', (WEB / "lib" / "flow-export.ts").read_text(encoding="utf-8"))
        self.assertIn("classe_prevista: '=1+1'", contract)

    def test_ac_020_metodologia_carrega_csvs_corrigidos(self):
        """Leitura executável da metodologia usa 250 execuções e médias finais @spec:AC-020"""
        result = subprocess.run(
            ["node", str(WEB / "lib" / "results.contract.test.cjs")], cwd=WEB,
            text=True, capture_output=True, timeout=30, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_ac_017_polling_usa_estados_reais_e_contadores(self):
        """Polling percorre estados recebidos, preserva pacotes lidos e para em pronta/erro/404 @spec:AC-017"""
        result = subprocess.run(
            ["node", str(WEB / "lib" / "analysis-poll.contract.test.cjs")], cwd=WEB,
            text=True, capture_output=True, timeout=30, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_rotulo_referencia_so_aparece_no_exemplo(self):
        """Upload não exibe rótulo herdado; exemplo mantém origem da referência."""
        classes = (ROOT / "core" / "matriz.py").read_text(encoding="utf-8")
        panel = (WEB / "components" / "ui" / "LivePanel.tsx").read_text(encoding="utf-8")
        example = (WEB / "components" / "ui" / "ExampleExperience.tsx").read_text(encoding="utf-8")

        self.assertIn('CLASSES = ("chat", "email", "transferencia", "streaming", "voip")', classes)
        self.assertNotIn("rotulo_referencia", panel)
        self.assertIn("flow?.rotulo_referencia", example)
        self.assertIn("Rótulo herdado da captura ISCX", example)
        self.assertNotIn("validar manualmente", panel.lower())

    def test_ac_018_019_fluxos_reais_alimentam_raio_x_e_mapa(self):
        """Resposta API alimenta render real, semente isolada e mapa limitado com omissões @spec:AC-018 @spec:AC-019"""
        result = subprocess.run(
            ["node", str(WEB / "lib" / "live-flows.contract.test.cjs")], cwd=WEB,
            text=True, capture_output=True, timeout=30, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_ac_018_019_rotas_reais_usam_adaptadores_sem_demo(self):
        """Aceite da ligação das rotas e estados; contrato executável cobre os valores @spec:AC-018 @spec:AC-019"""
        detail = (WEB / "components" / "ui" / "FlowDetails.tsx").read_text(encoding="utf-8")
        panel = (WEB / "components" / "ui" / "LivePanel.tsx").read_text(encoding="utf-8")
        map_view = (WEB / "components" / "ui" / "LiveMap.tsx").read_text(encoding="utf-8")
        self.assertIn("explicarFluxo(id, flow.n, seed, controller.signal)", detail)
        self.assertIn("toFlowXRay(flow, explanation, seed, origin)", detail)
        self.assertIn("<FlowXRay data={data} seed={seed} onSeedChange={setSeed}", detail)
        self.assertIn("cache.current.get(seed)", detail)
        self.assertIn("controller.abort()", detail)
        self.assertIn("<LiveMap id={analysis.id} seed={seed}", panel)
        self.assertIn("<FlowRibbons flows={result.ribbons}", map_view)
        self.assertIn("{result.omittedDuration} omitidos por duração desconhecida", map_view)
        self.assertIn("{result.notLoaded} ficaram fora", map_view)
        self.assertIn("controller.abort()", map_view)
        self.assertNotIn("DEMO_FLOW", detail + map_view)
        self.assertNotIn("ainda não está disponível", detail)

    def test_readme_documenta_contrato_real_de_duracao_mapa_e_explicacao(self):
        """README registra limites reais de duração, mapa e explicação sem alegar reprodução @spec:AC-018 @spec:AC-019 @spec:AC-021"""
        readme = (ROOT / "docs" / "SISTEMA.md").read_text(encoding="utf-8").lower()

        self.assertIn("duracao_s", readme)
        self.assertIn("primeiro e o último pacote observado com carga", readme)
        self.assertIn("exceder os 100 trios guardados", readme)
        self.assertIn("nunca estimada a partir dos pacotes guardados", readme)
        self.assertIn("até 500 fluxos principais", readme)
        self.assertIn("durações desconhecidas", readme)
        self.assertIn("a contagem de duração desconhecida cobre somente os carregados", readme)
        self.assertIn("fora pelo limite de 500", readme)
        self.assertIn("min(32, pacotes guardados)", readme)
        self.assertIn("b1/b2/p", readme)
        self.assertIn("oclusão de b2/p", readme)
        self.assertIn("uma semente (0–4) por requisição", readme)
        self.assertIn("pontos percentuais (p.p.)", readme)
        self.assertIn("não causalidade", readme)
        self.assertIn("inclusive a máscara de presença", readme)
        self.assertIn("uma semente (0–4) por requisição", readme)
        self.assertIn("pode ser `null` quando indisponível", readme)
        self.assertIn("não reproduzem necessariamente as previsões salvas no estudo", readme)
        self.assertIn("animações ilustrativas usam dados sintéticos explicitamente identificados", readme)
        self.assertIn("análise real usa os valores de pacotes", readme)

    def test_readme_reflete_estado_comprovado_da_fase_3(self):
        """Checklist não declara validação visual que ainda não ocorreu @spec:AC-022"""
        readme = (ROOT / "docs" / "SISTEMA.md").read_text(encoding="utf-8").lower()
        phase = readme.split("**fase 3 — telas do mvp**", 1)[1].split("**fase 4 — no ar**", 1)[0]

        self.assertIn("- [x] página inicial com upload conectado à api", phase)
        self.assertIn("estados recebida, extraindo, classificando, pronta e erro", phase)
        self.assertIn("- [x] painel:", phase)
        self.assertIn("- [x] raio-x do fluxo:", phase)
        self.assertIn("- [x] página de metodologia", phase)
        self.assertIn("- [ ] seguir [design.md]", phase)
        self.assertIn("revisão visual em 390 px e 1440 px pendente", phase)

    def test_t025_readme_marca_selecao_de_exemplos_e_dependencias_externas(self):
        """README não afirma deploy nem PCAP real sem evidência @spec:AC-025"""
        readme = (ROOT / "docs" / "SISTEMA.md").read_text(encoding="utf-8")
        self.assertIn("implantação, DNS e proxy ainda não foram validados", readme)
        self.assertIn("Cinco exemplos (um por classe)", readme)
        self.assertIn("entre os que estiveram no treino N do menor número de sementes", readme)
        self.assertIn("esses arquivos não vieram no ZIP", readme)
        self.assertIn("nenhum deploy foi executado", readme)
        self.assertIn("o protocolo foi aprovado", readme)
        self.assertIn("faltam os arquivos processados do experimento", readme)

    def test_design_documenta_duracao_e_limites_reais_do_mapa(self):
        """DESIGN descreve duração da extração e limite/omissões reais do mapa."""
        design = (ROOT / "docs" / "DESIGN.md").read_text(encoding="utf-8").lower()

        self.assertIn("duração observada na extração", design)
        self.assertIn("pode abranger mais do que os até 100 trios guardados", design)
        self.assertIn("até o máximo de 500", design)
        self.assertIn("durações desconhecidas entre os carregados", design)
        self.assertIn("a contagem de duração desconhecida cobre apenas os fluxos carregados", design)
        self.assertIn("inclusive a máscara", design)
        self.assertIn("fluxos não carregados por causa do limite", design)


if __name__ == "__main__":
    unittest.main()
