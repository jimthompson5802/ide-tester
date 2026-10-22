"""Command-line entry point for T01 launch checks."""

import argparse
import sys

from ide_smoke.orchestrator import run_attempt


class ArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse's default message echoes arbitrary argument values.
        self.print_usage(sys.stderr)
        self.exit(2, f"{self.prog}: Invalid command or arguments; use --help for supported options.\n")


def main(argv: list[str] | None = None) -> int:
    parser = ArgumentParser(
        prog="ide-smoke", description="Local IDE smoke-test harness (T01 launch; T02–T05 pending)."
    )
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run", help="Run T01 launch checks (T02–T05 pending)")
    run.add_argument("--ide", required=True, choices=["vscode"])
    run.add_argument("--config", metavar="PATH", help="YAML settings; default: config/harness.local.yaml in the current directory")
    arguments = parser.parse_args(argv)
    return run_attempt(arguments.ide, arguments.config)


if __name__ == "__main__":
    raise SystemExit(main())
