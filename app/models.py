from typing import Literal

from pydantic import BaseModel, Field


class ActionItem(BaseModel):
    task: str
    assignee: str = "Non assegnato"
    due_hint: str | None = None


class Metric(BaseModel):
    label: str
    value: str
    context: str | None = None


class MeetingAnalysis(BaseModel):
    summary: str
    key_points: list[str] = Field(default_factory=list)
    decisions: list[str] = Field(default_factory=list)
    action_items: list[ActionItem] = Field(default_factory=list)
    follow_ups: list[str] = Field(default_factory=list)
    participants: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    metrics: list[Metric] = Field(default_factory=list)


class AnalyzeRequest(BaseModel):
    transcript: str = Field(max_length=300_000)
    filename: str = ""
    language: Literal["it", "en"] = "it"


class AnalyzeResponse(BaseModel):
    analysis: MeetingAnalysis
    truncated: bool = False
    model_used: str = ""
