import assert from 'node:assert/strict'

import { formatDuration } from './attempt-review-utils'

assert.equal(formatDuration(0), '0с')
assert.equal(formatDuration(1), '<1с')
assert.equal(formatDuration(999), '<1с')
assert.equal(formatDuration(1000), '1с')
