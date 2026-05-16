import dayjs from 'dayjs'
import { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from 'lib/api/apiWrapper'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGetAll(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const INTERVAL_MINUTES: Record<string, number> = {
  '1m': 1,
  '5m': 5,
  '10m': 10,
  '30m': 30,
  '1h': 60,
  '1d': 1440,
}

function parseAttributes(query: NextApiRequest['query']): string[] {
  const raw = query.attributes
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string')
  if (typeof raw === 'string') return [raw]
  if (typeof query.attribute === 'string') return [query.attribute]
  return []
}

function buildStubSeries({
  attributes,
  startDate,
  endDate,
  interval,
}: {
  attributes: string[]
  startDate: string
  endDate: string
  interval: string
}) {
  const stepMinutes = INTERVAL_MINUTES[interval] ?? 60
  const start = dayjs(startDate)
  const end = dayjs(endDate)
  const points: { period_start: string; values: Record<string, string> }[] = []

  for (let cursor = start; cursor.isBefore(end); cursor = cursor.add(stepMinutes, 'minute')) {
    points.push({
      period_start: cursor.toISOString(),
      values: Object.fromEntries(attributes.map((attribute) => [attribute, '0'])),
    })
  }

  if (points.length === 0) {
    points.push({
      period_start: start.toISOString(),
      values: Object.fromEntries(attributes.map((attribute) => [attribute, '0'])),
    })
  }

  const series = Object.fromEntries(
    attributes.map((attribute) => [
      attribute,
      {
        yAxisLimit: 100,
        format: '%',
        total: 0,
        totalAverage: 0,
      },
    ])
  )

  return { data: points, series }
}

const handleGetAll = async (req: NextApiRequest, res: NextApiResponse) => {
  const attributes = parseAttributes(req.query)
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : ''
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : ''
  const interval = typeof req.query.interval === 'string' ? req.query.interval : '1h'

  if (!attributes.length || !startDate || !endDate) {
    return res.status(200).json({
      data: [],
      yAxisLimit: 0,
      format: '%',
      total: 0,
    })
  }

  if (attributes.length === 1) {
    const attribute = attributes[0]!
    const stub = buildStubSeries({ attributes, startDate, endDate, interval })
    return res.status(200).json({
      data: stub.data.map((point) => ({
        period_start: point.period_start,
        [attribute]: point.values[attribute] ?? '0',
      })),
      yAxisLimit: 100,
      format: '%',
      total: 0,
      totalAverage: 0,
    })
  }

  return res.status(200).json(buildStubSeries({ attributes, startDate, endDate, interval }))
}
