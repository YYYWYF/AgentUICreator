"""Resource discovery follows Creator's nested Python source layout."""
from pathlib import Path
import tomllib

from agent_ui_creator.contract_resources import creator_contract_root
from agent_ui_creator.domain_agent.skills import default_creator_skills_root


def test_nested_source_resolves_canonical_contracts_and_shared_skills():
    repository = Path(__file__).resolve().parents[4]
    creator = repository / "packages" / "creator"
    assert Path(str(creator_contract_root())).resolve() == repository / "contracts" / "creator"
    assert default_creator_skills_root() == creator / "skills"


def test_wheel_includes_resolve_to_the_same_contract_and_skill_owners():
    python_root = Path(__file__).resolve().parents[1]
    config = tomllib.loads((python_root / "pyproject.toml").read_text(encoding="utf-8"))
    includes = config["tool"]["hatch"]["build"]["targets"]["wheel"]["force-include"]
    owners = {target: (python_root / source).resolve() for source, target in includes.items()}
    repository = python_root.parents[2]
    assert owners["agent_ui_creator/_contracts/creator"] == repository / "contracts" / "creator"
    assert owners["agent_ui_creator/_skills"] == python_root.parent / "skills"
