"""Contrato local do workflow de deploy; não abre conexão com a VPS."""

from pathlib import Path
import os
import re
import subprocess
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/deploy.yml"


class TestDeployWorkflowContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = WORKFLOW.read_text(encoding="utf-8")
        match = re.search(r"(?ms)^        run: \|\n(?P<script>(?:^          .*\n|^\n)+)", cls.source)
        if match is None:
            raise AssertionError("Workflow precisa conter um único script de deploy")
        cls.script = textwrap.dedent(match.group("script"))

    def test_ac_024_triggers_and_serialization(self):
        """Gatilhos e serialização do deploy @spec:AC-024"""
        self.assertRegex(self.source, r"(?m)^on:\s*$")
        self.assertRegex(self.source, r"(?m)^  push:\s*$")
        self.assertRegex(self.source, r"(?m)^    branches: \[main\]\s*$")
        self.assertRegex(self.source, r"(?m)^  workflow_dispatch:\s*$")
        self.assertRegex(self.source, r"(?m)^concurrency:\s*$")
        self.assertRegex(self.source, r"(?m)^  group: deploy-main\s*$")
        self.assertRegex(self.source, r"(?m)^  cancel-in-progress: false\s*$")
        self.assertRegex(self.source, r"(?m)^permissions: \{\}\s*$")
        self.assertNotRegex(self.source, r"(?m)^\s*-?\s*uses:\s*")

    def test_ac_024_credentials_host_key_and_cleanup(self):
        """Credenciais temporárias e host estrito @spec:AC-024"""
        for name in ("VPS_HOST", "VPS_USER", "VPS_SSH_PRIVATE_KEY", "VPS_KNOWN_HOSTS"):
            self.assertIn(f"{name}: ${{{{ secrets.{name} }}}}", self.source)
        self.assertIn("VPS_DEPLOY_PATH: ${{ vars.VPS_DEPLOY_PATH }}", self.source)
        self.assertIn("-z \"${!name}\"", self.script)
        self.assertIn(
            "for name in VPS_HOST VPS_USER VPS_SSH_PRIVATE_KEY VPS_KNOWN_HOSTS VPS_DEPLOY_PATH; do",
            self.script,
        )
        self.assertIn("mktemp -d", self.script)
        self.assertIn("trap 'rm -rf -- \"$ssh_dir\"' EXIT", self.script)
        self.assertIn("umask 077", self.script)
        self.assertIn('chmod 600 "$ssh_dir/id_key" "$ssh_dir/known_hosts"', self.script)
        self.assertIn("StrictHostKeyChecking=yes", self.script)
        self.assertIn('UserKnownHostsFile="$ssh_dir/known_hosts"', self.script)
        self.assertNotIn("ssh-keyscan", self.source)
        subprocess.run(["bash", "-n"], input=self.script, text=True, check=True)

        empty_config = {name: "" for name in (
            "VPS_HOST", "VPS_USER", "VPS_SSH_PRIVATE_KEY", "VPS_KNOWN_HOSTS", "VPS_DEPLOY_PATH"
        )}
        result = subprocess.run(
            ["bash", "-c", self.script], capture_output=True, text=True,
            env={**os.environ, **empty_config}, check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Missing deploy configuration", result.stderr)

    def test_ac_025_remote_commands_and_documented_limit(self):
        """Comandos remotos seguros e deploy ainda pendente @spec:AC-025"""
        self.assertIn("set -euo pipefail", self.script)
        self.assertIn("VPS_DEPLOY_PATH\" =~ ^/[A-Za-z0-9_./-]+$", self.script)
        self.assertIn("cd -- '$VPS_DEPLOY_PATH' && git pull --ff-only origin main && docker compose up -d --build", self.script)
        self.assertNotRegex(self.source, r"\bgit\s+(?:reset|checkout)\b")
        self.assertNotRegex(self.source, r"\balembic\b|\bssh-keyscan\b")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        for name in ("VPS_HOST", "VPS_USER", "VPS_SSH_PRIVATE_KEY", "VPS_KNOWN_HOSTS", "VPS_DEPLOY_PATH"):
            self.assertIn(name, readme)
        self.assertIn("implantação externa", readme.lower())


if __name__ == "__main__":
    unittest.main()
