import * as assert from 'assert';
import {activate} from '../activator';

suite('activator — activate()', () => {
    const subscriptions: { dispose: () => void }[] = [];
    const registeredCommands: Record<string, () => void> = {};
    const registeredProviders: Record<string, unknown> = {};
    let panelRenderCalled = false;
    let panelReceivedStatusBar: unknown = null;
    let statusBarDisposeCalled = false;
    let sidebarReceivedStatusBar: unknown = null;

    suiteSetup(() => {
        const fakeContext = {subscriptions};
        const fakeVscode = {
            commands: {
                registerCommand: (id: string, fn: () => void) => {
                    registeredCommands[id] = fn;
                    return {
                        dispose: () => {
                        }
                    };
                },
            },
            window: {
                registerWebviewViewProvider: (id: string, provider: unknown) => {
                    registeredProviders[id] = provider;
                    return {
                        dispose: () => {
                        }
                    };
                },
            },
        };
        const FakePanel = {
            render: (_ctx: unknown, sb: unknown) => {
                panelRenderCalled = true;
                panelReceivedStatusBar = sb;
            }
        };

        class FakeStatusBar {
            dispose() {
                statusBarDisposeCalled = true;
            }
        }

        class FakeSidebar {
            static viewType = 'msgram.sidebarView';

            constructor(_ctx: unknown, sb: unknown) {
                sidebarReceivedStatusBar = sb;
            }
        }

        activate(fakeContext, fakeVscode, FakePanel, FakeSidebar, FakeStatusBar);
    });

    test('registra o comando msgram.run', () => {
        assert.ok('msgram.run' in registeredCommands);
    });

    test('executa Panel.render ao chamar msgram.run', () => {
        registeredCommands['msgram.run']();
        assert.strictEqual(panelRenderCalled, true);
    });

    test('registra o sidebar provider com o viewType correto', () => {
        assert.ok('msgram.sidebarView' in registeredProviders);
    });

    test('instancia StatusBar e adiciona às subscriptions', () => {
        assert.ok(subscriptions.some(s => s instanceof Object && 'dispose' in s));
    });

    test('passa StatusBar para o Sidebar', () => {
        assert.ok(sidebarReceivedStatusBar !== null);
    });

    test('registra os comandos msgram.openSettings e msgram.clearTokens', () => {
        assert.ok('msgram.openSettings' in registeredCommands);
        assert.ok('msgram.clearTokens' in registeredCommands);
    });

    test('adiciona 6 itens às subscriptions (status bar, sidebar e 4 comandos)', () => {
        assert.strictEqual(subscriptions.length, 6);
    });

    test('passa a StatusBar para Panel.render', () => {
        assert.ok(panelReceivedStatusBar !== null);
    });
});