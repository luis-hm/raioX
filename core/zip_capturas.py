"""Validação conservadora de lotes ZIP de capturas, sem extrair caminhos do usuário."""

from pathlib import PurePosixPath
from stat import S_IFMT, S_IFREG
from zipfile import BadZipFile, ZIP_DEFLATED, ZIP_STORED, ZipFile, ZipInfo

MAX_CAPTURAS = 20
MAX_DESCOMPACTADO = 500_000_000
MAX_CAPTURA = 200_000_000
ASSINATURAS = {
    ".pcap": {bytes.fromhex(x) for x in ("d4c3b2a1", "a1b2c3d4", "4d3cb2a1", "a1b23c4d")},
    ".pcapng": {bytes.fromhex("0a0d0d0a")},
}


def listar_capturas(arquivo: ZipFile) -> list[ZipInfo]:
    """Valida metadados e assinaturas antes de iniciar qualquer processamento."""
    membros: list[ZipInfo] = []
    total = 0
    for info in arquivo.infolist():
        nome = info.filename
        caminho = PurePosixPath(nome)
        if (not nome or nome.startswith("/") or "\\" in nome
                or ".." in caminho.parts or not caminho.name):
            raise ValueError("ZIP contém um caminho inválido")
        if info.is_dir():
            continue
        sufixo = caminho.suffix.lower()
        if sufixo not in ASSINATURAS:
            raise ValueError("ZIP deve conter apenas arquivos .pcap e .pcapng")
        if S_IFMT(info.external_attr >> 16) not in (0, S_IFREG):
            raise ValueError("ZIP contém um item que não é arquivo comum")
        if info.flag_bits & 1 or info.compress_type not in (ZIP_STORED, ZIP_DEFLATED):
            raise ValueError("ZIP criptografado ou com compactação não suportada")
        if info.file_size > MAX_CAPTURA:
            raise ValueError("Cada captura do ZIP deve ter até 200 MB")
        total += info.file_size
        if total > MAX_DESCOMPACTADO:
            raise ValueError("ZIP excede 500 MB após descompactar")
        membros.append(info)
        if len(membros) > MAX_CAPTURAS:
            raise ValueError("ZIP deve ter no máximo 20 capturas")
        try:
            with arquivo.open(info) as entrada:
                if entrada.read(4) not in ASSINATURAS[sufixo]:
                    raise ValueError("Captura inválida dentro do ZIP")
        except (BadZipFile, RuntimeError, OSError) as exc:
            raise ValueError("ZIP inválido") from exc
    if not membros:
        raise ValueError("ZIP não contém capturas .pcap ou .pcapng")
    return membros
