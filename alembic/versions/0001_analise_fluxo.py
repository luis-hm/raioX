"""Cria análises e fluxos anônimos."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision = "0001_analise_fluxo"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    json_type = sa.JSON(none_as_null=True).with_variant(JSONB(none_as_null=True), "postgresql")
    op.create_table(
        "analise",
        sa.Column("id", sa.String(12), primary_key=True),
        sa.Column("nome_exibicao", sa.String(255)),
        sa.Column("estado", sa.String(20), nullable=False),
        sa.Column("progresso", sa.Integer(), nullable=False),
        sa.Column("erro", sa.Text()),
        sa.Column("n_pacotes_lidos", sa.Integer(), nullable=False),
        sa.Column("n_fluxos_principais", sa.Integer(), nullable=False),
        sa.Column("n_fluxos_extras", sa.Integer(), nullable=False),
        sa.Column("duracao_observada_s", sa.Float()),
        sa.Column("motivo_parada", sa.String(80)),
        sa.Column("resumo_por_semente", json_type, nullable=False),
        sa.Column("origem", sa.String(10), nullable=False),
        sa.Column("versao_modelos", sa.String(255)),
        sa.Column("criada_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(id) = 12", name="ck_analise_id_12"),
        sa.CheckConstraint("estado IN ('recebida', 'extraindo', 'classificando', 'pronta', 'erro')", name="ck_analise_estado"),
        sa.CheckConstraint("origem IN ('upload', 'exemplo')", name="ck_analise_origem"),
        sa.CheckConstraint("progresso >= 0", name="ck_analise_progresso"),
        sa.CheckConstraint("n_pacotes_lidos >= 0", name="ck_analise_pacotes"),
        sa.CheckConstraint("n_fluxos_principais BETWEEN 0 AND 500", name="ck_analise_principais"),
        sa.CheckConstraint("n_fluxos_extras >= 0", name="ck_analise_extras"),
        sa.CheckConstraint("duracao_observada_s IS NULL OR duracao_observada_s >= 0", name="ck_analise_duracao"),
        sa.CheckConstraint("expira_em > criada_em", name="ck_analise_expiracao"),
    )
    op.create_table(
        "fluxo",
        sa.Column("analise_id", sa.String(12), sa.ForeignKey("analise.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("n", sa.Integer(), primary_key=True),
        sa.Column("proto", sa.Integer(), nullable=False),
        sa.Column("ini_s", sa.Float(), nullable=False),
        sa.Column("principal", sa.Boolean(), nullable=False),
        sa.Column("n_pacotes_guardados", sa.Integer(), nullable=False),
        sa.Column("bytes_amostra_cliente", sa.Integer(), nullable=False),
        sa.Column("bytes_amostra_servidor", sa.Integer(), nullable=False),
        sa.Column("pacotes", json_type, nullable=False),
        sa.Column("previsoes_por_semente", json_type),
        sa.Column("rotulo_referencia", sa.Integer()),
        sa.CheckConstraint("n >= 0", name="ck_fluxo_numero"),
        sa.CheckConstraint("proto IN (6, 17)", name="ck_fluxo_proto"),
        sa.CheckConstraint("ini_s >= 0", name="ck_fluxo_inicio"),
        sa.CheckConstraint("n_pacotes_guardados BETWEEN 0 AND 100", name="ck_fluxo_pacotes"),
        sa.CheckConstraint("bytes_amostra_cliente >= 0", name="ck_fluxo_bytes_cliente"),
        sa.CheckConstraint("bytes_amostra_servidor >= 0", name="ck_fluxo_bytes_servidor"),
        sa.CheckConstraint("principal OR previsoes_por_semente IS NULL", name="ck_fluxo_previsoes_principal"),
        sa.CheckConstraint("rotulo_referencia IS NULL OR rotulo_referencia BETWEEN 0 AND 4", name="ck_fluxo_rotulo"),
    )


def downgrade() -> None:
    op.drop_table("fluxo")
    op.drop_table("analise")
