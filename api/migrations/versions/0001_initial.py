"""Modelo inicial da Tarefa 1."""

from datetime import date

from alembic import op
from sqlalchemy import insert

from app.database import Base
from app.models import Equipment, Holiday, Warehouse

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
    bind.execute(insert(Warehouse), [
        {"id": 1, "code": "INSUMOS", "name": "Insumos"},
        {"id": 2, "code": "ADUBO", "name": "Adubo"},
        {"id": 3, "code": "PATIO_MAQUINAS", "name": "Pátio de Máquinas"},
        {"id": 4, "code": "LOJA", "name": "Loja"},
    ])
    bind.execute(insert(Equipment), [
        {"id": 1, "warehouse_id": 1, "kind": "Empilhadeira a gás", "quantity": 1, "notes": "Fixa"},
        {"id": 2, "warehouse_id": 1, "kind": "Empilhadeira elétrica / retrátil", "quantity": 1, "notes": "Fixa"},
        {"id": 3, "warehouse_id": 1, "kind": "Transpaleteira elétrica", "quantity": 2, "notes": "Fixas"},
        {"id": 4, "warehouse_id": 1, "kind": "Paleteira elétrica", "quantity": 2, "notes": "Pode atender outros armazéns"},
        {"id": 5, "warehouse_id": 1, "kind": "Paleteira manual", "quantity": 2, "notes": "Transita entre armazéns"},
        {"id": 6, "warehouse_id": 1, "kind": "Carrinho de mão", "quantity": 2, "notes": "Transita entre armazéns"},
        {"id": 7, "warehouse_id": 2, "kind": "Empilhadeira a gás", "quantity": 2, "notes": "Pode auxiliar Insumos"},
        {"id": 8, "warehouse_id": 2, "kind": "Paleteira manual", "quantity": 1, "notes": "Fixa"},
        {"id": 9, "warehouse_id": 3, "kind": "Empilhadeira a gás", "quantity": 1, "notes": "Dedicada a máquinas"},
        {"id": 10, "warehouse_id": 3, "kind": "Trator", "quantity": 4, "notes": None},
        {"id": 11, "warehouse_id": 4, "kind": "Carrinho de mão", "quantity": None, "notes": None},
    ])
    bind.execute(insert(Holiday), [
        {"date": date(2026, 10, 12), "description": "Nossa Senhora Aparecida"},
        {"date": date(2026, 11, 2), "description": "Finados"},
        {"date": date(2026, 11, 15), "description": "Proclamação da República"},
        {"date": date(2026, 11, 20), "description": "Consciência Negra"},
        {"date": date(2026, 12, 25), "description": "Natal"},
    ])


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
