import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Equipment, Warehouse


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as session:
        insumos = Warehouse(id=1, code="INSUMOS", name="Insumos")
        adubo = Warehouse(id=2, code="ADUBO", name="Adubo")
        session.add_all([insumos, adubo])
        session.add(Equipment(id=1, warehouse=insumos, kind="Empilhadeira", quantity=1))
        session.commit()
    yield factory
    Base.metadata.drop_all(engine)


@pytest.fixture
def client(session_factory):
    def override_db():
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
