import { defineConfig } from 'tsdown'

// fixedExtension: false обязателен: иначе tsdown пишет index.mjs/index.d.mts, и карта exports в package.json ломается
export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm', 'cjs'],
	outDir: 'dist',
	dts: true,
	clean: true,
	fixedExtension: false,
})
