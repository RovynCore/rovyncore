"""Loads and validates the YAML config. Every value must carry a source; scenario files override parts of the base."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent.parent
SOURCES = {"contract", "whitepaper", "draft", "assumption"}


class ConfigError(ValueError):
    pass


def _merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict) and "value" not in v:
            out[k] = _merge(out[k], v)
        elif isinstance(v, dict) and "value" in v and isinstance(out.get(k), dict):
            entry = dict(out[k])
            entry.update(v)
            out[k] = entry
        else:
            out[k] = v
    return out


def _check(tree: dict, path: str = "") -> None:
    for k, v in tree.items():
        here = f"{path}.{k}" if path else k
        if not isinstance(v, dict):
            raise ConfigError(f"{here}: every setting must be {{value, source}}")
        if "value" in v:
            if v.get("source") not in SOURCES:
                raise ConfigError(f"{here}: source must be one of {sorted(SOURCES)}")
        else:
            _check(v, here)


class Params:
    """A validated parameter set. `p["pool.emission_bp"]` returns the value; `p.entry(...)` the whole entry."""

    def __init__(self, tree: dict, name: str = "base"):
        _check(tree)
        self.tree = tree
        self.name = name

    @classmethod
    def load(cls, scenario: str | None = None, overrides: dict | None = None) -> "Params":
        tree = yaml.safe_load((ROOT / "config" / "base.yaml").read_text(encoding="utf-8"))
        name = "base"
        if scenario:
            path = ROOT / "config" / "scenarios" / f"{scenario}.yaml"
            if not path.exists():
                raise ConfigError(f"unknown scenario {scenario}")
            tree = _merge(tree, yaml.safe_load(path.read_text(encoding="utf-8")) or {})
            name = scenario
        if overrides:
            tree = _merge(tree, overrides)
        return cls(tree, name)

    def entry(self, key: str) -> dict:
        node: Any = self.tree
        for part in key.split("."):
            if part not in node:
                raise ConfigError(f"missing setting {key}")
            node = node[part]
        return node

    def __getitem__(self, key: str) -> Any:
        return self.entry(key)["value"]

    def digest(self) -> str:
        return hashlib.sha256(json.dumps(self.tree, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]

    def flat(self) -> list[tuple[str, Any, str, str]]:
        """[(key, value, source, status)] for reports."""
        out: list[tuple[str, Any, str, str]] = []

        def walk(node: dict, path: str) -> None:
            for k, v in node.items():
                here = f"{path}.{k}" if path else k
                if "value" in v:
                    out.append((here, v["value"], v["source"], v.get("status", "")))
                else:
                    walk(v, here)

        walk(self.tree, "")
        return out
