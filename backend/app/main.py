import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (테이블 등록)
from .config import get_settings
from .db import Base, engine
from .routers import auth, classes, groups, local_storage, me, photos

logging.basicConfig(level=logging.INFO)

settings = get_settings()

# MVP는 create_all로 스키마를 만든다. 운영 DB로 옮길 때 Alembic 도입.
Base.metadata.create_all(engine)

app = FastAPI(title="KidsLog API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(classes.router)
app.include_router(photos.router)
app.include_router(groups.router)
app.include_router(local_storage.router)
app.include_router(me.router)


@app.get("/health")
def health():
    return {"ok": True, "ai_provider": settings.resolved_ai_provider, "storage": settings.storage_backend}
