"""Respostas públicas: somente os metadados definidos no README."""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EstadoAnalise(str, Enum):
    recebida = "recebida"
    extraindo = "extraindo"
    classificando = "classificando"
    pronta = "pronta"
    erro = "erro"


class OrigemAnalise(str, Enum):
    upload = "upload"
    exemplo = "exemplo"


class Publico(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class Palpite(Publico):
    classe_prevista: str
    probabilidades: dict[str, float]


class PrevisoesSemente(Publico):
    B1: Palpite
    B2: Palpite
    P: Palpite


class PontoTemporal(Publico):
    segundo: int = Field(ge=0)
    bytes_observados: int = Field(ge=0)


class ConcordanciaPar(Publico):
    iguais: int = Field(default=0, ge=0)
    diferentes: int = Field(default=0, ge=0)


class ResumoSemente(Publico):
    contagens: dict[str, dict[str, int]] = Field(default_factory=dict)
    concordancia: dict[str, int] = Field(default_factory=dict)
    concordancia_pares: dict[str, ConcordanciaPar] = Field(default_factory=dict)
    serie_temporal: list[PontoTemporal] = Field(default_factory=list)


class StatusAnalise(Publico):
    id: str = Field(min_length=12, max_length=12)
    nome_exibicao: str | None = None
    estado: EstadoAnalise
    progresso: int = Field(ge=0)
    erro: str | None = None
    n_pacotes_lidos: int = Field(ge=0)
    n_fluxos_principais: int = Field(ge=0, le=500)
    n_fluxos_extras: int = Field(ge=0)
    n_arquivos_zip: int | None = Field(default=None, ge=1)
    duracao_observada_s: float | None = Field(default=None, ge=0)
    motivo_parada: str | None = None
    resumo_por_semente: dict[str, ResumoSemente] = Field(default_factory=dict)
    origem: OrigemAnalise
    versao_modelos: str | None = None
    criada_em: datetime
    expira_em: datetime


class FluxoResumo(Publico):
    analise_id: str
    n: int = Field(ge=0)
    proto: Literal[6, 17]
    ini_s: float = Field(ge=0)
    duracao_s: float | None = Field(default=None, ge=0)
    principal: bool
    n_pacotes_guardados: int = Field(ge=0, le=100)
    bytes_amostra_cliente: int = Field(ge=0)
    bytes_amostra_servidor: int = Field(ge=0)


class FluxoDetalhe(FluxoResumo):
    pacotes: list[tuple[int, int, float]] = Field(max_length=100)
    previsoes_por_semente: dict[str, PrevisoesSemente] | None = None
    rotulo_referencia: int | None = Field(default=None, ge=0, le=4)

    @model_validator(mode="after")
    def verificar_origem(self) -> "FluxoDetalhe":
        if not self.principal and self.previsoes_por_semente is not None:
            raise ValueError("fluxo extra não pode ter previsões")
        return self


class FluxoTabela(FluxoResumo):
    previsoes: dict[str, Palpite] = Field(default_factory=dict)
    estabilidade: dict[str, int] = Field(default_factory=dict)
    rotulo_referencia: int | None = Field(default=None, ge=0, le=4)


class PaginaFluxos(Publico):
    itens: list[FluxoTabela]
    total: int = Field(ge=0)
    pagina: int = Field(ge=1)
    tamanho: int = Field(ge=1, le=100)


class Prefixo(Publico):
    n_pacotes: int = Field(ge=1, le=32)
    B1: Palpite
    B2: Palpite
    P: Palpite


class ExplicacaoFluxo(Publico):
    semente: int = Field(ge=0, le=4)
    n_pacotes: int = Field(ge=3, le=32)
    prefixos: list[Prefixo] = Field(min_length=3, max_length=32)
    classes_originais_oclusao: dict[str, str]
    oclusao_pp: dict[str, list[float]]
    aviso: str


def serializar_fluxo(fluxo: object, origem: OrigemAnalise | str) -> FluxoDetalhe:
    """Um upload jamais expõe rótulo herdado de uma captura de exemplo."""
    dados = {campo: getattr(fluxo, campo) for campo in FluxoDetalhe.model_fields}
    if origem != OrigemAnalise.exemplo:
        dados["rotulo_referencia"] = None
    return FluxoDetalhe.model_validate(dados)
