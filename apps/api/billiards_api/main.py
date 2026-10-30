"""Minimal M0 health API. No planning, simulation or rule endpoints exist yet."""

import logging
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from billiards_api.config import read_cors_origins


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["eightball-api"] = "eightball-api"
    version: Literal["0.1.0"] = "0.1.0"


def create_app() -> FastAPI:
    origins = read_cors_origins()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        logging.getLogger("uvicorn.error").info(
            "Eightball API 0.1.0 ready; configured CORS origins: %d", len(origins)
        )
        yield

    app = FastAPI(title="Eightball AI API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=[],
    )

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse()

    return app
