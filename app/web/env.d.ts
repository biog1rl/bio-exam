declare namespace NodeJS {
	interface ProcessEnv {
		GITLAB_TOKEN: string
		GITLAB_REPO: string

		NODE_ENV: 'development' | 'production' | 'test'
	}
}
