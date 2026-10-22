import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "package_repository", Path(__file__).with_name("package-repository.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RepositoryArchiveEnvironmentTests(unittest.TestCase):
    def test_development_directories_and_lockfiles_are_excluded_at_any_depth(self):
        with tempfile.TemporaryDirectory(prefix="agent ui archive ") as directory:
            root = Path(directory)
            for parent in [root, root / "nested"]:
                parent.mkdir(exist_ok=True)
                for name in module.EXCLUDED_DIRECTORY_NAMES:
                    excluded = parent / name
                    excluded.mkdir()
                    (excluded / "fixture.txt").write_text("fixture", encoding="utf-8")
                (parent / "pnpm-lock.yaml").write_text("fixture", encoding="utf-8")
                (parent / "source.ts").write_text("fixture", encoding="utf-8")
            files = {
                file.relative_to(root).as_posix()
                for file in module.repository_files(root, root / "output.zip")
            }
            self.assertEqual(files, {"source.ts", "nested/source.ts"})

    def test_local_credentials_are_excluded_but_examples_are_kept(self):
        with tempfile.TemporaryDirectory(prefix="agent ui archive ") as directory:
            root = Path(directory)
            (root / "nested").mkdir()
            for name in [
                ".env.agentui.local", ".env.creator.local", ".env.development.local",
                "nested/.env.agentui.local", ".env.agentui.example", "source.ts",
            ]:
                (root / name).write_text("fixture", encoding="utf-8")
            files = {
                file.relative_to(root).as_posix()
                for file in module.repository_files(root, root / "output.zip")
            }
            self.assertEqual(files, {".env.agentui.example", "source.ts"})


if __name__ == "__main__":
    unittest.main()
