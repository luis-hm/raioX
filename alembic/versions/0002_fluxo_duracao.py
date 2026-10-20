"""Guarda duração exata conhecida; registros antigos permanecem sem duração."""

from alembic import op
import sqlalchemy as sa


revision = "0002_fluxo_duracao"
down_revision = "0001_analise_fluxo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        # env.py ativa foreign_keys antes do runner; isso abre uma transação
        # SQLite que não é finalizada pelo runner de DDL não transacional.
        # Confirmar a revisão anterior e usar autocommit evita perder a
        # alteração e o número de revisão ao fechar a conexão.
        op.get_bind().commit()
        op.get_bind().execution_options(isolation_level="AUTOCOMMIT")
        # ADD COLUMN preserva linhas antigas sem reconstruir a tabela sob FK ativa.
        op.execute("ALTER TABLE fluxo ADD COLUMN duracao_s FLOAT CONSTRAINT ck_fluxo_duracao CHECK (duracao_s IS NULL OR duracao_s >= 0)")
    else:
        op.add_column("fluxo", sa.Column("duracao_s", sa.Float(), nullable=True))
        op.create_check_constraint("ck_fluxo_duracao", "fluxo", "duracao_s IS NULL OR duracao_s >= 0")


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        op.get_bind().commit()
        op.get_bind().execution_options(isolation_level="AUTOCOMMIT")
        op.drop_column("fluxo", "duracao_s")
    else:
        op.drop_constraint("ck_fluxo_duracao", "fluxo", type_="check")
        op.drop_column("fluxo", "duracao_s")
