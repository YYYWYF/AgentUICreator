from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class QuestionOption(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    description: str | None = None


class QuestionStep(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1)
    question: str = Field(min_length=1)
    description: str | None = None
    options: list[QuestionOption] = Field(min_length=2, max_length=7)
    selectionMode: Literal["single", "multiple"]
    minSelections: int = Field(ge=0)
    maxSelections: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_options(self) -> "QuestionStep":
        ids = [option.id for option in self.options]
        if len(ids) != len(set(ids)):
            raise ValueError("option ids must be unique within a step")
        if self.maxSelections > len(ids) or self.minSelections > self.maxSelections:
            raise ValueError("selection bounds must fit the available options")
        if self.selectionMode == "single" and self.maxSelections != 1:
            raise ValueError("single selection requires maxSelections=1")
        return self


class QuestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: Literal[1]
    steps: list[QuestionStep] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def validate_steps(self) -> "QuestionRequest":
        ids = [step.id for step in self.steps]
        if len(ids) != len(set(ids)):
            raise ValueError("step ids must be unique")
        return self


class QuestionAnswers(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: dict[str, list[str]]

    def validate_for(self, request: QuestionRequest) -> "QuestionAnswers":
        if set(self.answers) != {step.id for step in request.steps}:
            raise ValueError("answers must cover every question step")
        for step in request.steps:
            selected = self.answers[step.id]
            allowed = {option.id for option in step.options}
            if (len(selected) != len(set(selected)) or
                not step.minSelections <= len(selected) <= step.maxSelections or
                not set(selected) <= allowed):
                raise ValueError(f"invalid selection for step {step.id}")
        return self
