from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.tools import BaseTool, tool
from pydantic import ValidationError

from .authorization_service import ServiceContractAuthorizationService
from .creation_service import UIServiceContractCreationService
from .models import (
    CreateUIServiceContractInput,
    MutateUIServiceContractInput,
    PrepareUIServiceContractChangeInput,
    ServiceContractError,
)
from .mutation_service import UIServiceContractMutationService


logger = logging.getLogger(__name__)
MAX_RESULT_CHARACTERS = 16_000


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _error(code: str, message: str, details: Any = None) -> str:
    rendered = _json(
        {
            "ok": False,
            "error": {
                "code": code,
                "message": message,
                **({"details": details} if details is not None else {}),
            },
        }
    )
    if len(rendered) <= MAX_RESULT_CHARACTERS:
        return rendered
    return _json(
        {
            "ok": False,
            "error": {
                "code": code,
                "message": "Service Contract error details exceeded the tool limit.",
            },
        }
    )


def _unexpected(operation: str) -> str:
    logger.exception("Unexpected Service Contract %s failure", operation)
    return _error(
        "SERVICE_CONTRACT_MUTATION_FAILED",
        f"The Creator Host could not complete Service Contract {operation}.",
    )


def create_service_contract_tools(
    authorization: ServiceContractAuthorizationService,
    creation: UIServiceContractCreationService,
    mutation: UIServiceContractMutationService,
) -> tuple[BaseTool, ...]:
    @tool(
        "prepare_ui_service_contract_change",
        args_schema=PrepareUIServiceContractChangeInput,
        description=(
            "Create or confirm an immutable Host-owned ownership proposal before "
            "creating or changing a public Service Contract. userAuthorizationEvidence "
            "must quote an exact substring of the current real User message. If the "
            "User did not explicitly choose ownership, propose without evidence, then "
            "stop all project side effects and ask for confirmation."
        ),
    )
    async def prepare_ui_service_contract_change(
        mode: str,
        changeKind: str | None = None,
        serviceName: str | None = None,
        contractPath: str | None = None,
        ownerPluginId: str | None = None,
        consumers: list[dict[str, Any]] | None = None,
        reason: str | None = None,
        proposalId: str | None = None,
        userAuthorizationEvidence: str | None = None,
    ) -> str:
        try:
            request = PrepareUIServiceContractChangeInput.model_validate(
                {
                    "mode": mode,
                    "changeKind": changeKind,
                    "serviceName": serviceName,
                    "contractPath": contractPath,
                    "ownerPluginId": ownerPluginId,
                    "consumers": consumers,
                    "reason": reason,
                    "proposalId": proposalId,
                    "userAuthorizationEvidence": userAuthorizationEvidence,
                }
            )
            return _json({"ok": True, "result": await authorization.prepare(request)})
        except ValidationError as error:
            return _error("SERVICE_CONTRACT_PROPOSAL_INVALID", str(error))
        except ServiceContractError as error:
            return _error(error.code, str(error), error.details)
        except Exception:
            return _unexpected("authorization")

    @tool(
        "create_ui_service_contract",
        args_schema=CreateUIServiceContractInput,
        description=(
            "Create exactly one new .ts Service Contract at the path and ownership "
            "scope bound to a Host-issued authorizationId. This create-only tool does "
            "not modify Provider or Consumer Plugins."
        ),
    )
    async def create_ui_service_contract(authorizationId: str, content: str) -> str:
        try:
            request = CreateUIServiceContractInput.model_validate(
                {"authorizationId": authorizationId, "content": content}
            )
            return _json(
                {
                    "ok": True,
                    "result": await creation.create(
                        request.authorizationId, request.content
                    ),
                }
            )
        except ValidationError as error:
            return _error("SERVICE_CONTRACT_AUTHORIZATION_REQUIRED", str(error))
        except ServiceContractError as error:
            return _error(error.code, str(error), error.details)
        except Exception:
            return _unexpected("creation")

    @tool(
        "mutate_ui_service_contract",
        args_schema=MutateUIServiceContractInput,
        description=(
            "Apply bounded exact text edits to the single existing Service Contract "
            "bound to a Host-issued authorizationId. The exact file must have been "
            "read in the current run. Deletion, rename, move, and whole-directory "
            "replacement are unavailable."
        ),
    )
    async def mutate_ui_service_contract(
        authorizationId: str, edits: list[dict[str, Any]]
    ) -> str:
        try:
            request = MutateUIServiceContractInput.model_validate(
                {"authorizationId": authorizationId, "edits": edits}
            )
            return _json(
                {
                    "ok": True,
                    "result": await mutation.mutate(
                        request.authorizationId, request.edits
                    ),
                }
            )
        except ValidationError as error:
            return _error("SERVICE_CONTRACT_MUTATION_FAILED", str(error))
        except ServiceContractError as error:
            return _error(error.code, str(error), error.details)
        except Exception:
            return _unexpected("mutation")

    return (
        prepare_ui_service_contract_change,
        create_ui_service_contract,
        mutate_ui_service_contract,
    )
