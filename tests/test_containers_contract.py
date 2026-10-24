"""Contratos leves da configuração local de containers de T-020."""

import json
import os
from pathlib import Path
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
EXAMPLE = ROOT / ".env.example"


def compose_config(*, web_port=None):
    command = ["docker", "compose", "--env-file", str(EXAMPLE), "config", "--format", "json"]
    environment = os.environ.copy()
    for key in ("POSTGRES_PASSWORD", "DATABASE_URL", "REDIS_URL", "RAIOX_RATE_SECRET",
                "RAIOX_UPLOAD_DIR", "API_URL", "WEB_PORT"):
        environment.pop(key, None)
    if web_port is not None:
        environment["WEB_PORT"] = str(web_port)
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=True,
                            env=environment)
    return json.loads(result.stdout)


class TestContainersContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = compose_config()
        cls.services = cls.config["services"]

    def test_ac_024_services_ports_and_dependencies(self):
        """Serviços e portas locais @spec:AC-024"""
        services = self.services
        self.assertTrue(self.config["networks"]["app"]["internal"])
        self.assertFalse(self.config["networks"]["public"].get("internal", False))
        self.assertEqual(set(services), {"db", "redis", "migrate", "api", "worker", "limpeza", "web"})
        for name in ("db", "redis", "migrate", "api", "worker", "limpeza"):
            self.assertFalse(services[name].get("ports"), name)
            self.assertEqual(set(services[name]["networks"]), {"app"}, name)
        self.assertEqual(set(services["web"]["networks"]), {"app", "public"})
        self.assertEqual(services["web"]["ports"], [{
            "mode": "ingress", "host_ip": "127.0.0.1", "target": 3000,
            "published": "3000", "protocol": "tcp",
        }])
        self.assertEqual(services["api"]["depends_on"]["migrate"]["condition"],
                         "service_completed_successfully")
        self.assertEqual(services["migrate"]["depends_on"]["db"]["condition"], "service_healthy")
        self.assertEqual(services["web"]["depends_on"]["api"]["condition"], "service_healthy")
        for name in ("worker", "limpeza"):
            self.assertEqual(services[name]["depends_on"]["migrate"]["condition"],
                             "service_completed_successfully")
        self.assertEqual(int(services["worker"]["mem_limit"]), 2 * 1024**3)

    def test_ac_024_commands_environment_and_shared_uploads(self):
        """Comandos e recursos compartilhados @spec:AC-024"""
        services = self.services
        self.assertEqual(services["migrate"]["command"],
                         ["alembic", "-c", "alembic/alembic.ini", "upgrade", "head"])
        self.assertEqual(services["worker"]["command"], ["python", "-m", "worker.queue"])
        self.assertIn("python -m worker.limpeza", " ".join(services["limpeza"]["command"]))
        self.assertIn("sleep 86400", " ".join(services["limpeza"]["command"]))
        expected_vars = {"DATABASE_URL", "REDIS_URL", "RAIOX_RATE_SECRET", "RAIOX_UPLOAD_DIR"}
        for name in ("api", "worker", "limpeza"):
            self.assertTrue(expected_vars <= services[name]["environment"].keys(), name)
            self.assertEqual(services[name]["environment"], services["api"]["environment"])
            self.assertEqual(services[name]["volumes"], services["api"]["volumes"])
        self.assertEqual(services["api"]["volumes"][0]["source"], "uploads")
        self.assertEqual(services["api"]["volumes"][0]["target"],
                         services["api"]["environment"]["RAIOX_UPLOAD_DIR"])
        self.assertEqual(services["web"]["environment"]["API_URL"], "http://api:8000")
        self.assertEqual(services["migrate"]["image"], services["api"]["image"])

    def test_ac_024_example_and_build_contexts(self):
        """Exemplo sem credenciais reais e imagens reproduzíveis @spec:AC-024"""
        example = EXAMPLE.read_text(encoding="utf-8")
        values = dict(line.split("=", 1) for line in example.splitlines()
                      if line and not line.startswith("#"))
        self.assertTrue({"POSTGRES_PASSWORD", "DATABASE_URL", "REDIS_URL", "RAIOX_RATE_SECRET",
                         "RAIOX_UPLOAD_DIR", "API_URL", "WEB_PORT"} <= values.keys())
        self.assertIn(values["POSTGRES_PASSWORD"], values["DATABASE_URL"])
        self.assertRegex(values["POSTGRES_PASSWORD"], r"^(?:replace|change)-")
        self.assertRegex(values["RAIOX_RATE_SECRET"], r"^(?:replace|change)-")
        self.assertEqual(self.services["migrate"]["build"]["dockerfile"], "Dockerfile.api")
        self.assertEqual(self.services["web"]["build"]["dockerfile"], "web/Dockerfile")
        self.assertEqual(self.services["web"]["build"]["context"],
                         self.services["migrate"]["build"]["context"])
        for name in ("api", "worker", "limpeza"):
            self.assertEqual(self.services[name]["image"], self.services["migrate"]["image"])
            self.assertNotIn("build", self.services[name])
        web_dockerfile = (ROOT / "web/Dockerfile").read_text()
        self.assertIn("COPY resultados_referencia/ ./resultados_referencia/", web_dockerfile)
        self.assertIn("COPY --from=builder --chown=node:node /app/resultados_referencia ./resultados_referencia", web_dockerfile)
        self.assertNotIn("resultados_referencia", (ROOT / ".dockerignore").read_text().splitlines())
        self.assertIn('output: "standalone"', (ROOT / "web/next.config.ts").read_text())
        self.assertIn("/app/.next/standalone", (ROOT / "web/Dockerfile").read_text())
        self.assertIn("USER raiox", (ROOT / "Dockerfile.api").read_text())
        api_dockerfile = (ROOT / "Dockerfile.api").read_text()
        self.assertIn("-r requirements-service.txt", api_dockerfile)
        self.assertNotIn("-r requirements.txt", api_dockerfile)
        service_requirements = (ROOT / "requirements-service.txt").read_text()
        self.assertIn("onnxruntime==", service_requirements)
        self.assertNotIn("\ntorch==", service_requirements)
        self.assertNotIn("web", (ROOT / ".dockerignore").read_text().splitlines())
        self.assertIn("node_modules", (ROOT / "web/.dockerignore").read_text().splitlines())
        self.assertIn(".env", (ROOT / ".gitignore").read_text().splitlines())
        self.assertFalse(re.search(r"(?im)^\s*(?:password|secret)\s*[:=]\s*[^$#\s]",
                                   (ROOT / "docker-compose.yml").read_text()))
        readme = (ROOT / "README.md").read_text()
        self.assertIn("docker compose up -d --build", readme)
        self.assertNotIn("rq worker analises", readme)

    def test_ac_024_custom_web_port(self):
        """Porta do web configurável e presa ao loopback @spec:AC-024"""
        ports = compose_config(web_port=4317)["services"]["web"]["ports"]
        self.assertEqual(len(ports), 1)
        self.assertEqual((ports[0]["host_ip"], ports[0]["published"], ports[0]["target"]),
                         ("127.0.0.1", "4317", 3000))


if __name__ == "__main__":
    unittest.main()
