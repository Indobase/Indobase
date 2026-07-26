import { FastifyReply, FastifyRequest } from "fastify";
import { analyticsRoute, runAnalyticsQuery } from "./utils/analyticsQuery.js";

interface GetLiveUsercountRequest {
  Params: { siteId: string };
  Querystring: { minutes: number };
}

export const buildLiveUsercountQuery = () =>
  `SELECT COUNT(DISTINCT(session_id)) AS count FROM events WHERE timestamp > now() - interval {minutes:Int32} minute AND site_id = {siteId:Int32}`;

export const getLiveUsercount = analyticsRoute<GetLiveUsercountRequest>(
  "live user count",
  async (req: FastifyRequest<GetLiveUsercountRequest>, res: FastifyReply) => {
    const { siteId } = req.params;
    const { minutes } = req.query;

    const result = await runAnalyticsQuery<{ count: number }>({
      query: buildLiveUsercountQuery(),
      params: {
        siteId: Number(siteId),
        minutes: Number(minutes || 5),
      },
    });

    return res.send({ count: result[0].count });
  }
);
