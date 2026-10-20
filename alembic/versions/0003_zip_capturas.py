"""Guarda a quantidade de capturas dos lotes ZIP; análises antigas permanecem iguais."""

from alembic import op
import sqlalchemy as sa


revision = "0003_zip_capturas"
down_revision = "0002_fluxo_duracao"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        op.get_bind().commit()
        op.get_bind().execution_options(isolation_level="AUTOCOMMIT")
    op.add_column("analise", sa.Column("n_arquivos_zip", sa.Integer(), nullable=True))


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        op.get_bind().commit()
        op.get_bind().execution_options(isolation_level="AUTOCOMMIT")
    op.drop_column("analise", "n_arquivos_zip")
