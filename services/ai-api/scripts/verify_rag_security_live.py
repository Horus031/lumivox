"""Run the separately frozen synthetic security cases with full adaptive policy."""

from scripts.verify_rag_comparative import main


if __name__ == "__main__":
    raise SystemExit(main(security_only=True))
