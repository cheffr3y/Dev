# Database connections

The web app shares one Prisma client per Node process. `lib/db/database-url.ts` supplies defaults only when a PostgreSQL URL does not already specify them:

| Parameter | Default | Purpose |
| --- | --- | --- |
| `connection_limit` | `3` | Maximum web connections per process |
| `pool_timeout` | `20` seconds | Wait for a busy connection before failing a query |
| `connect_timeout` | `10` seconds | Timeout when opening a connection |
| `max_idle_connection_lifetime` | `30` seconds | Release unused connections |

Credentials, SSL settings, schema, and provider options are preserved. Set explicit URL parameters when a different budget is needed. The Prisma CLI uses the original environment URL; these defaults apply to the shared web client, not migration or maintenance commands.

Count every process using the same database, including other apps, local tools, and old/new containers during a rolling deployment. With two web replicas and two replacements, the web budget is 12 connections. Leave capacity for migrations, administration, and other consumers. DigitalOcean's 1 GiB PostgreSQL tier has 22 available backend connections. More replicas or other consumers may require a smaller per-process limit or a reviewed PgBouncer configuration.

## Startup fails with reserved connection slots

`FATAL: remaining connection slots are reserved for roles with the SUPERUSER attribute` means the database has exhausted connections available to the application role. If it occurs in `prisma migrate deploy`, Next.js never starts; the later port health-check failure is a consequence.

1. Identify consumers and inspect `pg_stat_activity` using an existing administrative session. Check application pools, obsolete deployments, migration commands, and development tools. Do not print connection strings or credentials in logs.
2. Close confirmed unused clients or retire obsolete app processes. A web pool limit takes effect only after its new process starts; deploying a limit does not shrink pools in already-running old containers. If no connection can be opened, use the provider's administrative tooling/support or an approved controlled app restart to free existing sessions.
3. Retry the deployment after capacity is available. Keep the migration step enabled; do not bypass it with `next start`, use `db push`, or reset the database.
4. Verify migration success, healthy new containers, and the expected application revision. Review the combined connection budget before increasing pool sizes or replica counts.

Do not terminate unidentified or active transactions, change reserved slots, or increase infrastructure spending as a generic recovery step.

References: [Prisma v6 connection pool](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections/connection-pool), [DigitalOcean PostgreSQL connection pools](https://docs.digitalocean.com/products/databases/postgresql/how-to/manage-connection-pools/).
