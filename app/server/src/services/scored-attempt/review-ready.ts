import { sql } from 'drizzle-orm'

import { testAttempts } from '../../db/schema.js'

export const reviewReady = sql`(${testAttempts.uploadClosesAt} IS NULL OR ${testAttempts.uploadClosesAt} <= now())`

export const REVIEW_READY_SQL = '(ta.upload_closes_at IS NULL OR ta.upload_closes_at <= now())'
