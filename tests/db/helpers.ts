import pg from "pg";

export async function withPg<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.LOCAL_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export const resetDemo = () => withPg((c) => c.query("select drmc_demo.reset_demo()"));
