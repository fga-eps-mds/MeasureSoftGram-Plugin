/**
 * Mock do módulo 'vscode' para testes com Mocha fora do runtime do VSCode.
 * O tsc compila para out/tests/vscode.mock.js, que o .mocharc.cjs carrega via --require.
 */

const Module = require('module');

const vscode = {
    ViewColumn: { One: 1, Two: 2, Three: 3 },
    StatusBarAlignment: { Left: 1, Right: 2 },

    Uri: {
        joinPath: (...args: any[]) => ({
            fsPath: args.map((a: any) => (typeof a === 'string' ? a : a.fsPath)).join('/'),
        }),
        parse: (s: string) => ({ fsPath: s, toString: () => s }),
        file: (p: string) => ({ fsPath: p }),
    },

    ThemeColor: class ThemeColor {
        constructor(public id: string) {}
    },

    ThemeIcon: class ThemeIcon {
        constructor(public id: string, public color?: any) {}
    },

    MarkdownString: class MarkdownString {
        constructor(public value = '') {}
    },

    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },

    TreeItem: class TreeItem {
        description?: string; tooltip?: any; iconPath?: any; command?: any; contextValue?: string;
        constructor(public label: string, public collapsibleState = 0) {}
    },

    window: {
        createStatusBarItem: (_alignment: any, _priority: number) => ({
            command: undefined as any,
            tooltip: undefined as any,
            text: undefined as any,
            color: undefined as any,
            backgroundColor: undefined as any,
            show() {},
            hide() {},
            dispose() {},
        }),
        createOutputChannel: (_name: string) => ({
            appendLine: () => {},
            show: () => {},
            dispose: () => {},
        }),
        createWebviewPanel: () => {
            throw new Error('vscode.window.createWebviewPanel não mockado — injete via parâmetro');
        },
        createTerminal: () => {
            throw new Error('vscode.window.createTerminal não mockado — injete via parâmetro');
        },
        showErrorMessage: () => Promise.resolve(undefined),
        showInformationMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined),
        /** Os testes trocam por uma função que devolve o item escolhido. */
        showQuickPick: (items: any[]) => Promise.resolve(items[0]),
        registerTreeDataProvider: () => ({ dispose() {} }),
        createTreeView: () => ({ dispose() {}, reveal() {} }),
    },

    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },

    workspace: {
        workspaceFolders: undefined as any,
        /** Store configurável pelos testes: vscode.workspace._config[section][key] */
        _config: {} as Record<string, Record<string, any>>,
        getConfiguration(section = '') {
            const store = (vscode.workspace._config[section] ??= {});
            return {
                get<T>(key: string, def?: T): T | undefined {
                    return (store[key] as T) ?? def;
                },
                update(key: string, value: any, _target?: any) {
                    store[key] = value;
                    return Promise.resolve();
                },
            };
        },
    },

    commands: {
        _executed: [] as { command: string; args: any[] }[],
        executeCommand(command: string, ...args: any[]) {
            vscode.commands._executed.push({ command, args });
            return Promise.resolve();
        },
        registerCommand(_id: string, _fn: (...a: any[]) => any) {
            return { dispose() {} };
        },
    },

    EventEmitter: class EventEmitter {
        private _listeners: Array<(data: any) => void> = [];
        event = (listener: (data: any) => void) => {
            this._listeners.push(listener);
            return { dispose: () => {} };
        };
        fire(data: any) { this._listeners.forEach(l => l(data)); }
        dispose() {}
    },

    Disposable: class Disposable {
        constructor(private _fn?: () => void) {}
        dispose() { this._fn?.(); }
        static from(...disposables: Array<{ dispose(): void }>) {
            return new vscode.Disposable(() => disposables.forEach(d => d.dispose()));
        }
    },
};

require.cache['vscode'] = {
    id: 'vscode',
    filename: 'vscode',
    loaded: true,
    exports: vscode,
    paths: [],
    children: [],
    parent: null,
} as any;

const _originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...rest: any[]) {
    if (request === 'vscode') { return 'vscode'; }
    return _originalResolve.call(this, request, ...rest);
};

module.exports = vscode;
