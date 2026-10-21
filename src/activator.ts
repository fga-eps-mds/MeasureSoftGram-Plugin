export interface ActivatorVscode {
    commands: {
        registerCommand: (id: string, fn: (...args: any[]) => any) => { dispose: () => void };
        executeCommand?: (id: string, ...args: any[]) => Thenable<unknown>;
    };
    window: {
        registerWebviewViewProvider: (id: string, p: any, o?: any) => { dispose: () => void };
        registerTreeDataProvider?: (id: string, p: any) => { dispose: () => void };
        showWarningMessage?: (msg: string, ...items: string[]) => Thenable<string | undefined>;
        showInformationMessage?: (msg: string, ...items: string[]) => Thenable<string | undefined>;
    };
}

/** Árvore nativa opcional (o activator é testado sem ela). */
export interface TreeLike {
    refresh: () => Promise<void>;
    selectRepository: () => Promise<void>;
    selectOrganization: () => Promise<void>;
}

export interface ActivatorContext {
    subscriptions: { push: (d: { dispose: () => void }) => void };
    secrets?: { delete: (key: string) => Thenable<void> };
}

/**
 * Registra comandos, barra lateral e barra de status. Recebe as classes
 * como parâmetro para ser testável sem o módulo `vscode`.
 */
export function activate<S, P = any>(
    context: ActivatorContext,
    vscode: ActivatorVscode,
    Panel: { render: (ctx: any, statusBar: any) => P },
    Sidebar: { new(ctx: any, statusBar: any): S; viewType: string },
    StatusBar: { new(): { dispose: () => void } },
    makeTree?: (statusBar: any) => TreeLike,
    registerRepo?: (afterSuccess: () => Promise<void>) => Promise<void>,
): { sidebar: S; tree?: TreeLike } {
    const statusBar = new StatusBar();
    context.subscriptions.push(statusBar);

    context.subscriptions.push(
        vscode.commands.registerCommand('msgram.run', () => Panel.render(context, statusBar)),
    );

    let tree: TreeLike | undefined;
    if (makeTree && vscode.window.registerTreeDataProvider) {
        tree = makeTree(statusBar);
        context.subscriptions.push(vscode.window.registerTreeDataProvider('msgram.qualityView', tree));
        context.subscriptions.push(vscode.commands.registerCommand('msgram.refresh', () => tree!.refresh()));
        context.subscriptions.push(vscode.commands.registerCommand('msgram.selectRepository', () => tree!.selectRepository()));
        context.subscriptions.push(vscode.commands.registerCommand('msgram.selectOrganization', () => tree!.selectOrganization()));
        context.subscriptions.push(vscode.commands.registerCommand('msgram.openDashboard', (uid: string) => {
            const panel: any = Panel.render(context, statusBar);
            panel?.showTab?.('grafana', uid);
        }));
        context.subscriptions.push(vscode.commands.registerCommand('msgram.openActionTab', () => {
            const panel: any = Panel.render(context, statusBar);
            panel?.showTab?.('action');
        }));
        void tree.refresh();
    }

    const sidebar = new Sidebar(context, statusBar);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(Sidebar.viewType, sidebar, {
            webviewOptions: {retainContextWhenHidden: true},
        }),
    );

    if (registerRepo) {
        context.subscriptions.push(
            vscode.commands.registerCommand('msgram.registerRepo', () => registerRepo(async () => {
                await tree?.refresh();
                const s: any = sidebar;
                if (s?.hasWebview) {
                    await s.handleMessage({command: 'request_score'});
                }
                const panel: any = (Panel as any).currentPanel;
                if (panel?.hasWebview) {
                    await panel.handleMessage({command: 'request_score'});
                }
            })),
        );
    }


    context.subscriptions.push(
        vscode.commands.registerCommand('msgram.openSite', async () => {
            const real = require('vscode');
            const url = real.workspace.getConfiguration('msgram').get('serviceUrl') || 'https://msgram.lappis.rocks';
            await real.env.openExternal(real.Uri.parse(String(url)));
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('msgram.openSettings', async () => {
            // Abre o painel na aba Config.
            const panel: any = Panel.render(context, statusBar);
            panel?.showTab?.('settings');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('msgram.clearTokens', async () => {
            const confirm = await vscode.window.showWarningMessage?.(
                'Remover os tokens do MeasureSoftGram e do GitHub salvos no Secret Storage?',
                'Remover',
            );
            if (confirm !== 'Remover' || !context.secrets) {
                return;
            }
            await context.secrets.delete('msgram.token');
            await context.secrets.delete('msgram.githubToken');
            await vscode.window.showInformationMessage?.('Tokens removidos. Configure novamente em Settings.');
        }),
    );

    return {sidebar, tree};
}
