# apis server

## serve requests

1. Install redis (https://redis.io/docs/getting-started/installation/)
2. `redis-server`
3. Create .env file (checkout [example](./.env.example))
4. `yarn serve`

## start indexing

1. Install redis (https://redis.io/docs/getting-started/installation/)
2. `redis-server`
3. Create .env file (checkout [example](./.env.example))
4. `yarn index`

## run aggregated script without starting server

```
ts-node runner.ts scripts/aggregated/rebalance-info.ts arbmain print
```
