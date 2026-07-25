import assert from 'node:assert/strict'

import { mergeTelemetryMaps } from './telemetry.js'

assert.deepEqual(
	mergeTelemetryMaps(
		{
			q1: { timeSpentMs: 5000, focusLossCount: 1, visitCount: 2 },
		},
		{
			q1: { timeSpentMs: 7000, focusLossCount: 0, visitCount: 3 },
			q2: { timeSpentMs: 1500, focusLossCount: 1, visitCount: 1 },
		}
	),
	{
		q1: { timeSpentMs: 7000, focusLossCount: 1, visitCount: 3 },
		q2: { timeSpentMs: 1500, focusLossCount: 1, visitCount: 1 },
	}
)
