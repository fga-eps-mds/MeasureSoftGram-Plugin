import { defineConfig } from '@vscode/test-cli';
import os from 'node:os';
import path from 'node:path';

// Só os testes de integração rodam dentro de um VS Code real.
// Os unitários (src/tests/**, exceto integration/) rodam com Mocha e o
// mock de 'vscode' via `npm run test:unit`.
//
// user-data-dir fica fora do repositório: dentro dele o caminho passa do
// limite de 103 caracteres do socket IPC no macOS e o VS Code não sobe.
const userDataDir = path.join(os.tmpdir(), 'msgram-vscode-test');

export default defineConfig({
	files: 'out/tests/integration/**/*.test.js',
	launchArgs: ['--user-data-dir', userDataDir, '--disable-extensions'],
	mocha: {
		ui: 'tdd',
		timeout: 20000,
	},
});
