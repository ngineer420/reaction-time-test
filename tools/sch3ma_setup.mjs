#!/usr/bin/env node
/* One-time project setup on sch3ma, run with the project's secret key. Safe to re-run:
   PUT creates a collection and refuses one that exists, so a re-run reports the collection
   as already there and goes on to the settings below, which every run rewrites.

     SCH3MA_PROJECT=prj_… SCH3MA_SECRET=sk_live_… node tools/sch3ma_setup.mjs

   One collection. `results` holds one row per posted average: the test, the milliseconds,
   an optional name. Anyone reads it, a visitor with an identity creates, the owner alone
   deletes. Posting mints the anonymous identity. */

const project = process.env.SCH3MA_PROJECT;
const secret = process.env.SCH3MA_SECRET;
if (!project || !secret) {
  console.error("Set SCH3MA_PROJECT and SCH3MA_SECRET.");
  process.exit(1);
}
const base = `https://admin.sch3ma.com/${project}`;

const RESULTS = {
  prefix: "res",
  rules: { read: "public", create: "authenticated", delete: "owner:visitor" },
  fields: {
    test: { type: "text", required: true, enum: ["visual", "audio", "choice", "f1"], visible: "public" },
    ms: { type: "integer", required: true, min: 80, max: 3000, visible: "public" },
    name: { type: "text", maxLength: 20, visible: "public" },
    visitor: { type: "reference", to: "users", visible: "none" },
  },
};
const ORIGINS = ["https://reflexzap.com"];
const IDENTITY = { anonymous: true, landing_url: "https://reflexzap.com/" };

async function call(method, path, body) {
  const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

// The two-call rule: a first call answers a report and a token, the second commits.
async function twoCall(method, path, body, made) {
  const first = made ?? (await call(method, path, body));
  if (first.status === 201) return first;
  if (first.status !== 200 || !first.json || !first.json.report) throw new Error(`${method} ${path}: ${first.status} ${first.text}`);
  const second = await call(method, `${path}?_confirm=${encodeURIComponent(first.json.report.confirm_token)}`, body);
  if (second.status !== 200) throw new Error(`${method} ${path} (confirm): ${second.status} ${second.text}`);
  return second;
}

// A collection PUT creates and never replaces, so a second run answers 409. That is the
// collection standing where this script wants it, which is what the run asked for.
const made = await call("PUT", "/_schemas/results", RESULTS);
if (made.status === 409 && made.json?.error?.code === "collection_exists") {
  console.log("results: exists");
} else {
  console.log(`results: ${(await twoCall("PUT", "/_schemas/results", RESULTS, made)).status}`);
}
console.log(`origins: ${(await twoCall("PUT", "/_origins", { origins: ORIGINS })).status}`);
const identity = await call("PATCH", "/_identity", IDENTITY);
console.log(`identity: ${identity.status} ${identity.text}`);
