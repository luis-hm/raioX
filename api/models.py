"""Persistência dos metadados permitidos de análises e fluxos."""

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, JSON,
    String, Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_expiration() -> datetime:
    return utc_now() + timedelta(days=7)


class UTCDateTime(TypeDecorator):
    """Preserva timestamps UTC inclusive ao ler de SQLite."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.utcoffset() is None:
            raise ValueError("timestamp precisa conter fuso horário")
        value = value.astimezone(timezone.utc)
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.utcoffset() is None else value.astimezone(timezone.utc)


PortableJSON = JSON(none_as_null=True).with_variant(JSONB(none_as_null=True), "postgresql")


class Base(DeclarativeBase):
    pass


class Analise(Base):
    __tablename__ = "analise"
    __table_args__ = (
        CheckConstraint("length(id) = 12", name="ck_analise_id_12"),
        CheckConstraint("estado IN ('recebida', 'extraindo', 'classificando', 'pronta', 'erro')", name="ck_analise_estado"),
        CheckConstraint("origem IN ('upload', 'exemplo')", name="ck_analise_origem"),
        CheckConstraint("progresso >= 0", name="ck_analise_progresso"),
        CheckConstraint("n_pacotes_lidos >= 0", name="ck_analise_pacotes"),
        CheckConstraint("n_fluxos_principais BETWEEN 0 AND 500", name="ck_analise_principais"),
        CheckConstraint("n_fluxos_extras >= 0", name="ck_analise_extras"),
        CheckConstraint("duracao_observada_s IS NULL OR duracao_observada_s >= 0", name="ck_analise_duracao"),
        CheckConstraint("expira_em > criada_em", name="ck_analise_expiracao"),
    )

    id: Mapped[str] = mapped_column(String(12), primary_key=True)
    nome_exibicao: Mapped[str | None] = mapped_column(String(255))
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="recebida")
    progresso: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    erro: Mapped[str | None] = mapped_column(Text)
    n_pacotes_lidos: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    n_fluxos_principais: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    n_fluxos_extras: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    n_arquivos_zip: Mapped[int | None] = mapped_column(Integer)
    duracao_observada_s: Mapped[float | None] = mapped_column(Float)
    motivo_parada: Mapped[str | None] = mapped_column(String(80))
    resumo_por_semente: Mapped[dict[str, Any]] = mapped_column(PortableJSON, nullable=False, default=dict)
    origem: Mapped[str] = mapped_column(String(10), nullable=False)
    versao_modelos: Mapped[str | None] = mapped_column(String(255))
    criada_em: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, default=utc_now)
    expira_em: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, default=utc_expiration)

    fluxos: Mapped[list["Fluxo"]] = relationship(
        back_populates="analise", cascade="all, delete-orphan", passive_deletes=True
    )


class Fluxo(Base):
    __tablename__ = "fluxo"
    __table_args__ = (
        CheckConstraint("n >= 0", name="ck_fluxo_numero"),
        CheckConstraint("proto IN (6, 17)", name="ck_fluxo_proto"),
        CheckConstraint("ini_s >= 0", name="ck_fluxo_inicio"),
        CheckConstraint("duracao_s IS NULL OR duracao_s >= 0", name="ck_fluxo_duracao"),
        CheckConstraint("n_pacotes_guardados BETWEEN 0 AND 100", name="ck_fluxo_pacotes"),
        CheckConstraint("bytes_amostra_cliente >= 0", name="ck_fluxo_bytes_cliente"),
        CheckConstraint("bytes_amostra_servidor >= 0", name="ck_fluxo_bytes_servidor"),
        CheckConstraint("principal OR previsoes_por_semente IS NULL", name="ck_fluxo_previsoes_principal"),
        CheckConstraint("rotulo_referencia IS NULL OR rotulo_referencia BETWEEN 0 AND 4", name="ck_fluxo_rotulo"),
    )

    analise_id: Mapped[str] = mapped_column(
        String(12), ForeignKey("analise.id", ondelete="CASCADE"), primary_key=True
    )
    n: Mapped[int] = mapped_column(Integer, primary_key=True)
    proto: Mapped[int] = mapped_column(Integer, nullable=False)
    ini_s: Mapped[float] = mapped_column(Float, nullable=False)
    duracao_s: Mapped[float | None] = mapped_column(Float)
    principal: Mapped[bool] = mapped_column(Boolean, nullable=False)
    n_pacotes_guardados: Mapped[int] = mapped_column(Integer, nullable=False)
    bytes_amostra_cliente: Mapped[int] = mapped_column(Integer, nullable=False)
    bytes_amostra_servidor: Mapped[int] = mapped_column(Integer, nullable=False)
    pacotes: Mapped[list[list[float]]] = mapped_column(PortableJSON, nullable=False)
    previsoes_por_semente: Mapped[dict[str, Any] | None] = mapped_column(PortableJSON)
    rotulo_referencia: Mapped[int | None] = mapped_column(Integer)

    analise: Mapped[Analise] = relationship(back_populates="fluxos")
