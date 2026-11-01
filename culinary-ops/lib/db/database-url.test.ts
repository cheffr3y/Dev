import test from "node:test";
import assert from "node:assert/strict";
import { applicationDatabaseUrl } from "./database-url";

test("web connections have a bounded per-process pool independent of host CPU count", () => {
  const url = new URL(applicationDatabaseUrl("postgresql://user:pass@db.example:25060/culinary_ops?schema=public&sslmode=require")!);
  assert.equal(url.searchParams.get("connection_limit"), "3");
  assert.equal(url.searchParams.get("pool_timeout"), "20");
  assert.equal(url.searchParams.get("connect_timeout"), "10");
  assert.equal(url.searchParams.get("max_idle_connection_lifetime"), "30");
  assert.equal(url.searchParams.get("sslmode"), "require");
  assert.equal(url.searchParams.get("schema"), "public");
});
test("explicit provider pool settings and encoded credentials survive unchanged", () => {
  const value = "postgres://user:p%40ss%3Aword%26x@db.example:25061/my-db?connection_limit=2&pool_timeout=40&connect_timeout=15&max_idle_connection_lifetime=60&pgbouncer=true&sslmode=require";
  const url = new URL(applicationDatabaseUrl(value)!);
  assert.equal(url.password, "p%40ss%3Aword%26x"); assert.equal(url.port, "25061");
  assert.equal(url.searchParams.get("connection_limit"), "2"); assert.equal(url.searchParams.get("pool_timeout"), "40");
  assert.equal(url.searchParams.get("connect_timeout"), "15"); assert.equal(url.searchParams.get("max_idle_connection_lifetime"), "60");
  assert.equal(url.searchParams.get("pgbouncer"), "true"); assert.equal(url.searchParams.get("sslmode"), "require");
  assert.equal(applicationDatabaseUrl(applicationDatabaseUrl(value)), applicationDatabaseUrl(value));
});
test("missing configuration retains Prisma's normal validation without revealing credentials", () => {
  assert.equal(applicationDatabaseUrl(undefined), undefined);
  assert.equal(applicationDatabaseUrl("file:./local.db"), "file:./local.db");
  assert.throws(() => applicationDatabaseUrl("invalid-secret-url"), error => error instanceof Error && !error.message.includes("invalid-secret-url"));
});
