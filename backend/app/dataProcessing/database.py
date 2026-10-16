
import os
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)

from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

url = make_url(os.environ["DATABASE_URL"])

if url.drivername in {"postgres", "postgresql"}:
    url = url.set(drivername="postgresql+asyncpg")

query = dict(url.query)
query.setdefault("ssl", "require")
url = url.set(query=query)

engine = create_async_engine(url)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
