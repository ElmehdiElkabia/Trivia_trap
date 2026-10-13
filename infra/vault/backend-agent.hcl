pid_file = "/tmp/vault-agent.pid"

vault {
  address = "http://vault:8200"
}

auto_auth {
  method "approle" {
    mount_path = "auth/approle"

    config = {
      role_id_file_path                   = "/vault/approle/role-id"
      secret_id_file_path                 = "/vault/approle/secret-id"
      remove_secret_id_file_after_reading = false
    }
  }
}

template_config {
  static_secret_render_interval = "5m"
  exit_on_retry_failure         = true
}

# Process Supervisor Mode injects the secret directly into FastAPI's process
# environment. No plaintext DATABASE_URL file is persisted in a Docker volume.

env_template "DATABASE_URL" {
  contents             = "{{ with secret \"secret/data/trivia/postgres\" }}postgresql+asyncpg://{{ env \"POSTGRES_USER\" }}:{{ .Data.data.password }}@postgres:5432/{{ env \"POSTGRES_DB\" }}{{ end }}"
  error_on_missing_key = true
}

env_template "JWT_SECRET_KEY" {
  contents             = "{{ with secret \"secret/data/trivia/backend-auth\" }}{{ .Data.data.jwt_secret_key }}{{ end }}"
  error_on_missing_key = true
}

env_template "SMTP_PASSWORD" {
  contents             = "{{ with secret \"secret/data/trivia/backend-auth\" }}{{ .Data.data.smtp_password }}{{ end }}"
  error_on_missing_key = true
}

exec {
  command = ["/bin/sh", "/app/scripts/start_backend.sh"]

  # Secret rotations take effect after a controlled backend container restart.

  restart_on_secret_changes = "never"
  restart_stop_signal       = "SIGTERM"
}
