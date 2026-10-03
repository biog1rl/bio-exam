import { db } from './src/db/index.js'
import { tests, questions, answerKeys } from './src/db/schema.js'

async function main() {
	const allTests = await db.select().from(tests)
	console.log('Tests:', allTests.length)

	const allQuestions = await db.select().from(questions)
	console.log('Questions:', JSON.stringify(allQuestions, null, 2))

	const allAnswerKeys = await db.select().from(answerKeys)
	console.log('Answer Keys:', JSON.stringify(allAnswerKeys, null, 2))
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
