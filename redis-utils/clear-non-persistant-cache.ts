import redis from "ioredis";

const client = redis.createClient();

async function main() {
  let cursor: string | number = 0;
  let keys = [];
  let total = 0;
  let total2 = 0;
  while (cursor !== "0") {
    [cursor, keys] = await client.scan(cursor);
    for (const key of keys) {
      const ttl = await client.ttl(key);
      if (ttl !== -1) {
        total2 += 1;
        await client.del(key);
      }
    }
    total += keys.length;
  }
  console.log("iteration completed on total keys:", total);
  console.log("deleted keys:", total2);
}

main()
  .catch(console.error)
  .then(async () => {
    console.log("quitting...");
    await client.quit();
    process.exit(0);
  });
