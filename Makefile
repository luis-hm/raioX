.DEFAULT_GOAL := run

COMPOSE := docker compose

.PHONY: run dev up down logs ps url check-env

check-env:
	@test -f .env || { printf 'Arquivo .env ausente. Execute: cp .env.example .env e configure as credenciais.\n' >&2; exit 1; }

# Um comando inicia web, API, worker, banco, Redis e a migração.
run: check-env
	$(COMPOSE) up --build

# Backend em containers; frontend com recarga automática no host.
dev: check-env
	$(COMPOSE) stop web
	$(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml up -d --build api worker limpeza
	@test -d web/node_modules || npm --prefix web ci
	@printf 'Frontend: http://127.0.0.1:3000\n'
	cd web && API_URL=http://127.0.0.1:8000 npm run dev -- --hostname 127.0.0.1

up: check-env
	$(COMPOSE) up -d --build
	@$(MAKE) --no-print-directory url

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

ps:
	$(COMPOSE) ps

url: check-env
	@$(COMPOSE) port web 3000 | sed 's@^@Frontend: http://@'
