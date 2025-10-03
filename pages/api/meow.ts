import { NextApiRequest, NextApiResponse } from "next";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const COUNTER_KEY = "meow-global-count";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const count = await redis.incr(COUNTER_KEY);
    res.status(200).json({ count });
  } else if (req.method === "GET") {
    const count = Number(await redis.get(COUNTER_KEY)) || 0;
    res.status(200).json({ count });
  } else {
    res.status(405).end();
  }
}
