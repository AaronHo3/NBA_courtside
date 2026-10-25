# Deploying a public, read-only copy

The app was built local-first. A public copy is **read-only**: it serves the Parquet data you
ingested on your own machine and never contacts stats.nba.com (cloud IP ranges are blocked by the
provider anyway, and nobody but you should be able to trigger fetches). Ingestion stays on your
Mac; you push data to the server with one command whenever it changes.

```
your Mac                                   server (any Ubuntu VM with Docker)
make ingest ...  ->  data/nba/parquet  ==rsync==>  /opt/courtside/data/nba  ->  api (read-only)
                                                                              -> web (nginx)
                                                                              -> caddy (HTTPS)
```

What the public mode changes (`PUBLIC_READ_ONLY=1`, see `backend/app/config.py`):

- `/api/ingestion/*` routes are not registered (404).
- `POST /api/shots/fetch-player` answers 403.
- `/api/scouting/*`, `/api/jobs/*` and `/api/ingestion/*` are not mounted at all (404): shortlists, reports,
  custom roles, uploads and job control stay on your own machine until an owner login exists.
- Everything else is identical. There is **no authentication**; anyone with the URL can read the
  data. Do not deploy the scouting features (uploads, annotations, copilot) in this mode; they need
  access control first (see `docs/scouting/DECISIONS.md` DEC-19).

## Sizing

Today `data/nba/parquet` is about 35 MB for 30 seasons of summaries plus 5 seasons of shots and
matchups; a full 30-season load will be a few hundred MB. DuckDB reads Parquet lazily and the
API holds nothing else in memory, so a 2 vCPU / 2 GB VM is enough. The raw JSON cache (`data/nba/raw`,
~900 MB) is never copied. Expect roughly 5–12 USD per month at the usual VM providers (Hetzner,
DigitalOcean, Linode, Vultr); Fly.io or Railway also work if you prefer not to manage a VM, but
the steps below assume a plain Ubuntu VM because it is the simplest thing to debug.

## One-time server setup

1. Create an Ubuntu 24.04 VM with a public IPv4 address. Open inbound TCP 22, 80, 443 in its
   firewall. (Optional) point a DNS `A` record such as `stats.example.com` at the IP; without a
   domain the site is served over plain HTTP on the IP.
2. Install Docker on the server:
   ```bash
   ssh ubuntu@SERVER_IP
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER && newgrp docker
   ```
3. Put the code on the server (either `git clone` your repository or `rsync` the checkout without
   `data/`, `node_modules/`, `.venv/`):
   ```bash
   sudo mkdir -p /opt/courtside && sudo chown $USER /opt/courtside
   git clone <your repo url> /opt/courtside
   ```
4. From your Mac, push the data (this also restarts the API):
   ```bash
   make sync-data HOST=ubuntu@SERVER_IP DEST=/opt/courtside
   ```
   The first run fails at the `restart` step because nothing is running yet; that is fine.
5. On the server, start the stack:
   ```bash
   cd /opt/courtside
   SITE_ADDRESS=stats.example.com make deploy-up      # with a domain: automatic HTTPS
   SITE_ADDRESS=:80 make deploy-up                    # no domain: http://SERVER_IP
   ```
6. Check: `curl -s https://stats.example.com/api/health` should return
   `{"success": true, "data": {"status": "ok", "namespace": "nba", "read_only": true}, ...}`,
   and the site should open without the amber "Demo data" strip.

## Every time your local data changes

```bash
make sync-data HOST=ubuntu@SERVER_IP
```

rsync copies only changed Parquet files and the manifest, then restarts the API so DuckDB sees
the new files. Run it after the current 30-season ingestion finishes and after the bios pass.

## Updating the code

```bash
ssh ubuntu@SERVER_IP "cd /opt/courtside && git pull && SITE_ADDRESS=stats.example.com make deploy-up"
```

## Troubleshooting

- **Site shows demo data or "no data found"**: the manifest or Parquet did not sync, or
  `NBA_NAMESPACE` is not `nba`. Run `docker compose ... logs api | head` and look for
  `serving namespace=nba`.
- **HTTPS does not come up**: DNS must point at the server before Caddy can obtain a certificate;
  `docker compose ... logs caddy` shows the ACME error. Fall back to `SITE_ADDRESS=:80` meanwhile.
- **API returns 500 after a sync**: a Parquet file was mid-copy when the API restarted; run
  `make sync-data` again.
- **Someone needs to trigger ingestion**: they cannot; run it locally and sync.
