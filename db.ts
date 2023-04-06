import type { Db } from 'mongodb'
import { MongoClient } from 'mongodb'

export let db: Db

export async function connectMongo() {
  const client = await MongoClient.connect('mongodb://localhost:27017')

  db = client.db('stats')
}
