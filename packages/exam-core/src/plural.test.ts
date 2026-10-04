import assert from 'node:assert/strict'
import { test } from 'vitest'

import { pluralRu } from './plural'

const FORMS = ['вариант', 'варианта', 'вариантов'] as const

test.each([
	[0, 'вариантов'],
	[1, 'вариант'],
	[2, 'варианта'],
	[4, 'варианта'],
	[5, 'вариантов'],
	[11, 'вариантов'],
	[12, 'вариантов'],
	[14, 'вариантов'],
	[21, 'вариант'],
	[22, 'варианта'],
	[25, 'вариантов'],
	[101, 'вариант'],
	[111, 'вариантов'],
	[112, 'вариантов'],
] as const)('pluralRu(%i) → %s', (n, expected) => {
	assert.equal(pluralRu(n, FORMS), expected)
})
