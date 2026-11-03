import test from "node:test";
import assert from "node:assert/strict";
import { validRequestOrigin } from "./request-origin";

const request = (headers: Record<string, string>, url = "http://localhost:3000/api/invoice-ocr") => new Request(url, { method: "POST", headers });

test("direct browser requests and requests without Origin keep working", () => {
  assert.equal(validRequestOrigin(request({origin:"http://localhost:3000"})), true);
  assert.equal(validRequestOrigin(request({})), true);
  assert.equal(validRequestOrigin(request({origin:"http://localhost:3001"})), false);
});

test("TLS proxy requests match the public forwarded host and protocol", () => {
  const proxy = {host:"localhost:3000", "x-forwarded-host":"mise.example.com", "x-forwarded-proto":"https"};
  assert.equal(validRequestOrigin(request({...proxy,origin:"https://mise.example.com"})), true);
  assert.equal(validRequestOrigin(request({...proxy,origin:"https://mise.example.com:443"})), false);
  assert.equal(validRequestOrigin(request({...proxy,origin:"http://mise.example.com"})), false);
  assert.equal(validRequestOrigin(request({...proxy,origin:"https://other.example.com"})), false);
  assert.equal(validRequestOrigin(request({host:"mise.example.com","x-forwarded-proto":"https",origin:"https://mise.example.com"})), true);
  assert.equal(validRequestOrigin(request({host:"mise.example.com",origin:"https://mise.example.com"},"https://internal:3000/api/invoice-ocr")), true);
  assert.equal(validRequestOrigin(request({...proxy,"x-forwarded-host":"mise.example.com:8443",origin:"https://mise.example.com:8443"})), true);
});

test("malformed and unrelated origins or forwarding values stay blocked", () => {
  const proxy = {"x-forwarded-host":"mise.example.com", "x-forwarded-proto":"https"};
  for (const origin of ["null","garbage","https://mise.example.com/","https://mise.example.com/path","https://user@mise.example.com","https://mise.example.com.evil.test","https://evil.test","file://mise.example.com"]) {
    assert.equal(validRequestOrigin(request({...proxy,origin})), false,origin);
  }
  for (const host of ["mise.example.com, evil.test","mise.example.com/evil","evil.test@mise.example.com","mise.example.com\\evil","mise.example.com?x"]) {
    assert.equal(validRequestOrigin(request({...proxy,"x-forwarded-host":host,origin:"https://mise.example.com"})), false,host);
  }
  assert.equal(validRequestOrigin(request({...proxy,"x-forwarded-proto":"https,http",origin:"https://mise.example.com"})),false);
});
