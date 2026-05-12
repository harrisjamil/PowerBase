#!/usr/bin/env bash
# Run ON the Ubuntu VM (SSH session). Opens Postgres to the network — tighten pg_hba later.
set -euo pipefail

PGCONF="$(ls /etc/postgresql/*/main/postgresql.conf 2>/dev/null | head -1 || true)"
if [[ -z "${PGCONF}" ]]; then
  echo "Could not find /etc/postgresql/*/main/postgresql.conf — install postgresql or adjust paths."
  exit 1
fi
PGHBA="$(dirname "${PGCONF}")/pg_hba.conf"
echo "Using postgresql.conf: ${PGCONF}"
echo "Using pg_hba.conf:     ${PGHBA}"

# Listen on all interfaces (uncomment / replace common Ubuntu defaults)
sudo sed -i "s/^#listen_addresses = 'localhost'$/listen_addresses = '*'/" "${PGCONF}"
sudo sed -i "s/^#listen_addresses = '\*'$/listen_addresses = '*'/" "${PGCONF}"
sudo sed -i "s/^listen_addresses = 'localhost'$/listen_addresses = '*'/" "${PGCONF}"

# Remote password auth (INSECURE if exposed to whole internet — pair with SG restricted to your IP)
if ! sudo grep -qE '^host[[:space:]]+all[[:space:]]+all[[:space:]]+0\.0\.0\.0/0[[:space:]]+scram-sha-256' "${PGHBA}"; then
  echo "host all all 0.0.0.0/0 scram-sha-256" | sudo tee -a "${PGHBA}" >/dev/null
fi

sudo ufw allow 5432/tcp || true
sudo ufw reload || true

sudo systemctl restart postgresql
sleep 1
echo "--- listen (expect 0.0.0.0:5432 or *:5432, not 127.0.0.1 only) ---"
sudo ss -tlnp | grep 5432 || true
echo "--- done ---"
echo "If Test-NetConnection from your PC still fails: add AWS inbound TCP 5432 (source: My IP) on this instance's security group."
