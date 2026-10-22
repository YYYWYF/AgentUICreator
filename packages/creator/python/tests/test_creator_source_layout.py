"""Resource discovery follows Creator's nested Python source layout."""
from pathlib import Path
import tomllib

from agent_ui_creator.contract_resources import creator_contract_root
from agent_ui_creator.domain_agent.skills import default_creator_skills_root


def test_nested_source_resolves_canonical_contracts_and_shared_skills():
    repository = Path(__file__).resolve().parents[4]
    creator = repository / "packages" / "creator"
    assert Path(str(creator_contract_root())).resolve() == repository / "packages" / "creator" / "contracts" / "creator"
    assert default_creator_skills_root() == creator / "skills"


def test_wheel_includes_resolve_to_the_same_contract_and_skill_owners():
    python_root = Path(__file__).resolve().parents[1]
    config = tomllib.loads((python_root / "pyproject.toml").read_text(encoding="utf-8"))
    includes = config["tool"]["hatch"]["build"]["targets"]["wheel"]["force-include"]
    owners = {target: (python_root / source).resolve() for source, target in includes.items()}
    repository = python_root.parents[2]
    assert owners["agent_ui_creator/_contracts/creator"] == repository / "packages" / "creator" / "contracts" / "creator"
    assert owners["agent_ui_creator/_skills"] == python_root.parent / "skills"


def test_wheel_dependency_pins_match_the_full_environment_lock():
    from packaging.requirements import Requirement
    from packaging.utils import canonicalize_name

    python_root = Path(__file__).resolve().parents[1]
    config = tomllib.loads((python_root / "pyproject.toml").read_text(encoding="utf-8"))
    project = config["project"]

    def pins(entries):
        result = {}
        for entry in entries:
            requirement = Requirement(entry)
            constraints = list(requirement.specifier)
            assert len(constraints) == 1 and constraints[0].operator == "==", entry
            assert "*" not in constraints[0].version, entry
            assert requirement.marker is None and requirement.url is None, entry
            name = canonicalize_name(requirement.name)
            assert name not in result, entry
            result[name] = constraints[0].version
        return result

    runtime = pins(project["dependencies"])
    test = pins(project["optional-dependencies"]["test"])
    locked = pins(
        line.strip()
        for line in (python_root / "requirements.lock").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    )
    assert runtime.keys().isdisjoint(test)
    assert runtime | test == locked
    assert set(test) == {"pytest", "iniconfig", "pluggy", "pygments"}
