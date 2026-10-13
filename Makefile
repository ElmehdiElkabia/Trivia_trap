all: check-secrets
	@docker compose up --build -d

check-secrets:
	@if [ ! -s secrets/smtp_password ] && \
		! docker compose run --rm --no-deps --entrypoint /bin/sh vault-bootstrap \
			-c 'test -s /vault/bootstrap/unseal-key' >/dev/null 2>&1; then \
		echo "Missing secrets/smtp_password."; \
		echo "Create it with: nano secrets/smtp_password"; \
		exit 1; \
	fi

up: all

down:
	@docker compose down --remove-orphans

down-v:
	@docker compose down --volumes --remove-orphans

re: down all

.PHONY: all check-secrets down down-v re up
