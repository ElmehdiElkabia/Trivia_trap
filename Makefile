all:
	@docker compose up --build -d

up: all

down:
	@docker compose down --remove-orphans

down-v:
	@docker compose down --volumes --remove-orphans

re: down all

.PHONY: all  down re up

# 	@docker compose exec -T postgres sh -c '\
# 		export VAULT_ADDR=http://vault:8200; \
# 		TOKEN=$$(vault write -field=token auth/approle/login \
# 			role_id="$$(cat /vault/approle/role-id)" \
# 			secret_id="$$(cat /vault/approle/secret-id)"); \
# 		VAULT_TOKEN="$$TOKEN" vault kv get -field=password secret/trivia/postgres'
