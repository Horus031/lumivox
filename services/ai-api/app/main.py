from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import (
    deadline_risk,
    deadline_risk_insight,
    engagement_retention,
    health,
    native_task_risk,
    native_task_risk_insight,
    pbi,
    weekly_reflection,
)
from app.services.deadline_risk_runtime import (
    load_deadline_risk_runtime,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.deadline_risk_runtime = load_deadline_risk_runtime()

    yield

    app.state.deadline_risk_runtime = None


app = FastAPI(
    title="Lumivox AI API",
    version="0.3.0",
    description="AI and behavioural analytics microservice for Lumivox.",
    lifespan=lifespan,
)

app.include_router(health.router, prefix="/api/v1", tags=["Health"])
app.include_router(pbi.router, prefix="/api/v1/pbi", tags=["PBI"])
app.include_router(
    deadline_risk.router,
    prefix="/api/v1/ml/deadline-risk",
    tags=["Deadline Risk ML"],
)
app.include_router(
    deadline_risk_insight.router,
    prefix="/api/v1/ai/deadline-risk-insight",
    tags=["Deadline Risk AI Insight"],
)
app.include_router(
    native_task_risk.router,
    prefix="/api/v1/native-task-risk",
    tags=["Native Task Risk"],
)
app.include_router(
    native_task_risk_insight.router,
    prefix="/api/v1/ai/native-task-risk-insight",
    tags=["Native Task Risk AI Insight"],
)
app.include_router(
    weekly_reflection.router,
    prefix="/api/v1/reflections/weekly",
    tags=["Weekly Reflection"],
)
app.include_router(
    engagement_retention.router,
    prefix="/api/v1/engagement",
    tags=["Engagement Retention"],
)