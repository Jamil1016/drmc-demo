// Local verification only: prove that two database sessions claiming from the
// same batch at the same time never receive the same item.
//
//   npm run db:race
//
// Session A claims inside an OPEN transaction (so its row locks are still
// held), then session B claims. With FOR UPDATE SKIP LOCKED, B does not wait
// for A and does not see A's rows: it gets the next ones. Then both sessions
// drain the rest of the batch in parallel.
import pg from "pg";

const connectionString = process.env.LOCAL_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54339/postgres";
const a = new pg.Client({ connectionString });
const b = new pg.Client({ connectionString });
await Promise.all([a.connect(), b.connect()]);

const claim = async (client, batchId, limit) =>
  (await client.query("select drmc_app.claim_approval_items($1, $2) as task_did", [batchId, limit])).rows.map((r) => r.task_did);

try {
  await a.query("select drmc_demo.reset_demo()");
  const ids = (await a.query(
    "select task_did from drmc_analytics.v_daily_report_approvals where is_awaiting_approval order by task_did limit 40",
  )).rows.map((r) => r.task_did);
  const batchId = (await a.query(
    "insert into drmc_app.approval_batch (approver_email, total) values ('demo@example.com', $1) returning id", [ids.length],
  )).rows[0].id;
  await a.query(
    "insert into drmc_app.approval_batch_item (batch_id, task_did) select $1, unnest($2::text[])", [batchId, ids],
  );
  console.log(`batch ${batchId} with ${ids.length} items`);

  await a.query("begin");
  const startedA = Date.now();
  const claimedA = await claim(a, batchId, 15);
  console.log(`session A (transaction still open) claimed ${claimedA.length}`);

  const startedB = Date.now();
  const claimedB = await claim(b, batchId, 15);
  console.log(`session B claimed ${claimedB.length} in ${Date.now() - startedB} ms without waiting for A`);
  await a.query("commit");
  console.log(`session A committed after ${Date.now() - startedA} ms`);

  const overlapFirst = claimedA.filter((id) => claimedB.includes(id));
  console.log(`overlap between A and B: ${overlapFirst.length}`);

  // Drain the rest from both sessions at once.
  const drain = async (client) => {
    const mine = [];
    for (;;) {
      const got = await claim(client, batchId, 3);
      if (got.length === 0) return mine;
      mine.push(...got);
    }
  };
  const [restA, restB] = await Promise.all([drain(a), drain(b)]);
  const allA = [...claimedA, ...restA];
  const allB = [...claimedB, ...restB];
  const overlap = allA.filter((id) => allB.includes(id));
  const total = new Set([...allA, ...allB]).size;
  console.log(`parallel drain: A +${restA.length}, B +${restB.length}`);
  console.log(`totals: A=${allA.length} B=${allB.length} distinct=${total} overlap=${overlap.length}`);

  // Stale claims: nothing is claimable now, but a claim older than 2 minutes is.
  const none = await claim(b, batchId, 50);
  await a.query(
    "update drmc_app.approval_batch_item set claimed_at = now() - interval '3 minutes' where batch_id = $1 and task_did = any($2)",
    [batchId, allA],
  );
  const stale = await claim(b, batchId, 50);
  console.log(`fresh claims re-claimable: ${none.length}; after ageing A's claims past 2 minutes, re-claimed ${stale.length} (= A's ${allA.length})`);

  const ok = overlapFirst.length === 0 && overlap.length === 0 && total === ids.length && none.length === 0 && stale.length === allA.length;
  console.log(ok ? "PASS: disjoint claims, nothing lost, stale claims reclaimable" : "FAIL");
  await a.query("select drmc_demo.reset_demo()");
  process.exitCode = ok ? 0 : 1;
} finally {
  await Promise.all([a.end(), b.end()]);
}
