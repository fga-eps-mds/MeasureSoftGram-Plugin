import {commands, ExtensionContext, window} from "vscode";
import {MeasureSoftGramPanel} from "./panels/measureSoftGramPanel";
import {MeasureSoftGramSidebar} from "./panels/measureSoftGramSidebar";
import {MsgramStatusBar} from "./statusbar/msgramStatusBar";
import {activate as _activate} from "./activator";
import {disposeSharedActRunner} from "./services/actRunner";
import {QualityTreeProvider} from "./views/qualityTree";
import {loadSettings, makeSettingsDeps, updateProjectSettings} from "./config/settings";
import {registerWorkspaceRepo} from "./services/registerRepo";
import {detectWorkspaceHints} from "./utilities/workspaceRepo";
import {getOutputChannel} from "./utilities/log";
import {workspace} from "vscode";

/** API exposta em `extension.exports`, usada só pelo teste de integração. */
export interface MsgramExtensionApi {
    sidebar: MeasureSoftGramSidebar;
    tree?: QualityTreeProvider;
    currentPanel: () => MeasureSoftGramPanel | undefined;
}

export function activate(context: ExtensionContext): MsgramExtensionApi {
    const {sidebar, tree} = _activate(
        context, {commands, window}, MeasureSoftGramPanel, MeasureSoftGramSidebar, MsgramStatusBar,
        (statusBar) => new QualityTreeProvider({settingsDeps: makeSettingsDeps(context), statusBar}),
        async (afterSuccess) => {
            const deps = makeSettingsDeps(context);
            const settings = await loadSettings(deps);
            if (!settings.token) {
                void window.showWarningMessage('Informe o token do MeasureSoftGram em Configurar antes de cadastrar o repositório.');
                return;
            }
            const folder = workspace.workspaceFolders?.[0];
            const hints = folder ? await detectWorkspaceHints(folder.uri.fsPath) : {};
            try {
                const result = await registerWorkspaceRepo(settings, hints, {
                    ui: {
                        pick: async (items, placeHolder) => await window.showQuickPick(items, {placeHolder}),
                        input: async (prompt, value) => await window.showInputBox({prompt, value}),
                        confirm: async (message, okLabel) => (await window.showInformationMessage(message, {modal: true}, okLabel)) === okLabel,
                        info: (m) => void window.showInformationMessage(m),
                        warn: (m) => void window.showWarningMessage(m),
                    },
                    persist: (patch) => updateProjectSettings(patch, deps),
                    log: (m) => getOutputChannel().appendLine(m),
                });
                if (result.kind === 'registered') {
                    await afterSuccess();
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                getOutputChannel().appendLine(`[registro] erro: ${message}`);
                void window.showErrorMessage(`Não foi possível cadastrar o repositório: ${message}`);
            }
        },
    );
    // Mata uma execução local pendente ao desativar a extensão.
    context.subscriptions.push({dispose: disposeSharedActRunner});
    return {
        sidebar,
        tree: tree as QualityTreeProvider | undefined,
        currentPanel: () => MeasureSoftGramPanel.currentPanel,
    };
}