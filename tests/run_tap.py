"""Executa unittest e expõe os títulos com @spec ao verificador ONP (TAP)."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class TapResult(unittest.TestResult):
    def __init__(self, stream, descriptions=True, verbosity=1):
        super().__init__(stream, descriptions, verbosity)
        self.stream = stream
        self.index = 0

    def _emit(self, test, ok, directive=None):
        self.index += 1
        title = (test.shortDescription() or test.id()).replace("\n", " ")
        suffix = f" # {directive}" if directive else ""
        self.stream.write(f"{'ok' if ok else 'not ok'} {self.index} - {title}{suffix}\n")
        self.stream.flush()

    def addSuccess(self, test):
        super().addSuccess(test)
        self._emit(test, True)

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self._emit(test, False)

    def addError(self, test, err):
        super().addError(test, err)
        self._emit(test, False)

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self._emit(test, True, "SKIP")


class TapRunner(unittest.TextTestRunner):
    resultclass = TapResult

    def run(self, test):
        result = super().run(test)
        self.stream.write(f"1..{result.index}\n")
        self.stream.flush()
        for test_case, trace in result.failures + result.errors:
            self.stream.write(f"# {test_case.id()}\n")
            self.stream.write("\n".join(f"# {line}" for line in trace.splitlines()) + "\n")
        return result


def main():
    suite = unittest.defaultTestLoader.discover(str(ROOT / "tests"), pattern="test_*.py")
    result = TapRunner(stream=sys.stdout, verbosity=0).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
