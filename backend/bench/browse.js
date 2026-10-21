// Read capacity: visitors load the event page over and over without a pause.
//   VUS (50), DURATION (30s)
import { query, EVENT_PAGE } from './lib.js';

export const options = {
  vus: Number(__ENV.VUS || 50),
  duration: __ENV.DURATION || '30s',
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  // Per-function latencies show up in the summary only with a threshold on them
  thresholds: Object.fromEntries(
    EVENT_PAGE.map(([name]) => [`http_req_duration{fn:${name}}`, ['p(95)>=0']])
  ),
};

export default function () {
  for (const [name, args] of EVENT_PAGE) query(name, args);
}
