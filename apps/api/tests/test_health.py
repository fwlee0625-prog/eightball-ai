import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from billiards_api.config import read_cors_origins
from billiards_api.main import create_app

SCHEMA = json.loads(
    (Path(__file__).resolve().parents[3] / "packages/contracts/schemas/health-response.schema.json")
    .read_text()
)


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch):
    monkeypatch.delenv("EIGHTBALL_CORS_ORIGINS", raising=False)


def test_health_contract_and_openapi():
    Draft202012Validator.check_schema(SCHEMA)
    with TestClient(create_app()) as client:
        response = client.get("/health")
        assert response.status_code == 200
        Draft202012Validator(SCHEMA).validate(response.json())
        assert response.json() == {
            "status": "ok", "service": "eightball-api", "version": "0.1.0"
        }
        assert "/health" in client.get("/openapi.json").json()["paths"]
        assert client.post("/health").status_code == 405
        assert client.get("/not-implemented").status_code == 404


@pytest.mark.parametrize("origin", ["http://localhost:5173", "http://127.0.0.1:5173"])
def test_allowed_origin_and_preflight(origin):
    with TestClient(create_app()) as client:
        assert client.get("/health", headers={"Origin": origin}).headers[
            "access-control-allow-origin"
        ] == origin
        response = client.options("/health", headers={
            "Origin": origin, "Access-Control-Request-Method": "GET"
        })
        assert response.status_code == 200
        assert "access-control-allow-credentials" not in response.headers


def test_rejected_origin_and_method():
    with TestClient(create_app()) as client:
        response = client.get("/health", headers={"Origin": "https://untrusted.example"})
        assert "access-control-allow-origin" not in response.headers
        response = client.options("/health", headers={
            "Origin": "https://untrusted.example", "Access-Control-Request-Method": "GET"
        })
        assert response.status_code == 400
        response = client.options("/health", headers={
            "Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"
        })
        assert response.status_code == 400


@pytest.mark.parametrize("origins", [[], ["https://studio.example:8443"]])
def test_explicit_origin_configuration(monkeypatch, origins):
    monkeypatch.setenv("EIGHTBALL_CORS_ORIGINS", json.dumps(origins))
    assert read_cors_origins() == origins
    with TestClient(create_app()) as client:
        response = client.get("/health", headers={"Origin": "http://localhost:5173"})
        assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("raw", [
    "", "not-json", '"http://localhost:5173"', '[1]', '["*"]',
    '["ftp://localhost"]', '["http://localhost/path"]',
    '["http://user:password@localhost"]', '["http://localhost:99999"]',
    '["http://localhost:0"]', '["http://localhost?query=1"]',
])
def test_invalid_configuration_fails_before_startup(monkeypatch, raw):
    monkeypatch.setenv("EIGHTBALL_CORS_ORIGINS", raw)
    with pytest.raises(ValueError, match="EIGHTBALL_CORS_ORIGINS must be"):
        create_app()
