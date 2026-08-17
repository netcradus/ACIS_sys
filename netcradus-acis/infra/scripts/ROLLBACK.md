# Image Versioning & Rollback

## The problem this solves

Before this, every service in `docker-compose.prod.yml` used a plain
`build:` block with no `image:` tag. `docker compose up -d --build` always
overwrote the same anonymous build-cache image — there was no way to tell
which git commit was actually running in production, and no way to go back
to the previous version except re-checking-out an old commit and doing a
full rebuild (slow, and only possible if you still had that commit around).

## What changed

Every buildable service now also has an `image: acis/<service>:${IMAGE_TAG:-latest}`
line. Docker Compose tags whatever it builds with that name — so:

- `docker compose -f docker-compose.prod.yml up -d --build` with no
  `IMAGE_TAG` set behaves exactly as before (tags everything `:latest`).
- `infra/scripts/deploy.sh` sets `IMAGE_TAG` to the current commit's short
  git SHA before building, so each deploy produces a distinctly-tagged,
  immutable image (`acis/gateway:a1b2c3d4e5f6`, etc.) that stays around
  after the next deploy overwrites `:latest` — Docker doesn't delete an old
  tag just because a new one was created.

## Deploying

```bash
git pull                      # or checkout the commit you want to deploy
infra/scripts/deploy.sh
```

This refuses to run against a dirty working tree (uncommitted changes) —
a deploy has to correspond to a real, identifiable commit, or "roll back to
what was running before" is meaningless.

Every deploy appends a line to `infra/scripts/deploy-history.log`
(gitignored — local operational state, not source) recording the commit
sha, timestamp, and commit subject. That file is "what's currently deployed,
and what came before it."

## Rolling back

```bash
tail infra/scripts/deploy-history.log     # find the sha to go back to
infra/scripts/rollback.sh <git-sha>
```

This does **not** rebuild anything — it just restarts the stack pointed at
the already-built `acis/<service>:<git-sha>` images from that earlier
deploy. It fails loudly (before touching anything) if any of those images
are no longer present locally, e.g. because they were pruned.

Rollback only changes which image tag is running — it does **not** touch
the database. If the commit you're rolling back past included a schema
change, you also need to consider whether that change is backward-compatible
with the older application code (this deployment uses Hibernate
`ddl-auto: update`, which only ever adds columns/tables, never drops them,
so rolling the app back while the newer/wider schema is still in place is
normally safe — the older code just ignores the extra columns).

After a rollback, `IMAGE_TAG` is only exported for that shell session — the
compose file's own default (`:latest`) still points at the newer, rolled-
-back-from version. Fix forward and run `deploy.sh` again once ready; don't
leave a production stack pinned to a manual rollback indefinitely by
accident.

## Disk usage

Every deploy leaves the previous images' tags around (that's the whole
point — it's what makes rollback possible). This does use disk space over
time. Periodically prune tags you're confident you'll never roll back to:

```bash
docker image ls 'acis/*' --format '{{.Repository}}:{{.Tag}}'
docker image rm acis/gateway:<old-sha> ...   # remove ones you no longer need
```

Never `docker image prune -a` blindly on the production host — that would
also remove the `:latest`/current-sha images the running containers
reference.
