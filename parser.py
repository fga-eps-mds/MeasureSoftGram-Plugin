"""
Coleta métricas do SonarCloud para o repositório e grava um JSON em
./analytics-raw-data/, consumido pelo repositório de documentação.

Uso: python parser.py <nome-do-repositorio> <versao-ou-ref>
"""
import json
import sys
from datetime import datetime

import requests

TODAY = datetime.now()

METRICS_SONAR = [
    "files",
    "functions",
    "complexity",
    "comment_lines_density",
    "duplicated_lines_density",
    "coverage",
    "ncloc",
    "tests",
    "test_errors",
    "test_failures",
    "test_execution_time",
    "security_rating",
]

BASE_URL = "https://sonarcloud.io/api/measures/component_tree?component=fga-eps-mds_"
TIMEOUT_SECONDS = 30


def fetch_metrics(repo: str) -> dict:
    url = f'{BASE_URL}{repo}&metricKeys={",".join(METRICS_SONAR)}&ps=500'
    response = requests.get(url, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    data = response.json()
    # Sem este bloco a resposta é um erro do Sonar, não métricas.
    # O component_tree devolve o agregado em 'baseComponent', que é o que o DOC lê.
    if not isinstance(data, dict) or "measures" not in data.get("baseComponent", {}):
        raise ValueError(f"Resposta do SonarCloud sem 'baseComponent.measures': {json.dumps(data)[:300]}")
    return data


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("uso: python parser.py <repositorio> <versao>", file=sys.stderr)
        return 2

    repo, release_version = argv[1], argv[2]
    try:
        data = fetch_metrics(repo)
    except (requests.RequestException, ValueError) as exc:
        print(f"erro ao coletar métricas de {repo}: {exc}", file=sys.stderr)
        return 1

    file_path = (
        f'./analytics-raw-data/fga-eps-mds-{repo}-'
        f'{TODAY.strftime("%m-%d-%Y-%H-%M-%S")}-{release_version}.json'
    )
    with open(file_path, "w", encoding="utf-8") as fp:
        json.dump(data, fp)
    print(f"métricas gravadas em {file_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
