import {ExtensionContext, ViewColumn, Webview, WebviewPanel, window} from 'vscode';
import {MeasureSoftGramBase} from './measureSoftGramBase';
import type {MsgramStatusBar} from '../statusbar/msgramStatusBar';
import type {SettingsDeps} from '../config/settings';

/** Painel: só o ciclo de vida do WebviewPanel. A lógica está na base. */
export class MeasureSoftGramPanel extends MeasureSoftGramBase {
  public static currentPanel: MeasureSoftGramPanel | undefined;

  private readonly _panel: WebviewPanel;

  private constructor(
      panel: WebviewPanel,
      extensionContext: ExtensionContext,
      statusBar?: MsgramStatusBar,
      settingsDeps?: SettingsDeps,
  ) {
    super(extensionContext, statusBar, settingsDeps);
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionContext.extensionUri);
    this._panel.webview.onDidReceiveMessage(
        async (message) => {
          await this.handleMessage(message);
        },
        undefined,
        this._disposables,
    );
  }

  protected get _webview(): Webview {
    return this._panel.webview;
  }

  public static render(
      extensionContext: ExtensionContext,
      statusBar?: MsgramStatusBar,
      vswindow: Pick<typeof window, 'createWebviewPanel'> = window,
      settingsDeps?: SettingsDeps,
  ): MeasureSoftGramPanel {
    if (MeasureSoftGramPanel.currentPanel) {
      MeasureSoftGramPanel.currentPanel._panel.reveal(ViewColumn.One);
      return MeasureSoftGramPanel.currentPanel;
    }
    const panel = vswindow.createWebviewPanel(
        'MeasureSoftGramView',
        'MeasureSoftGram',
        ViewColumn.One,
        MeasureSoftGramPanel.prototype._webviewOptionsFor(extensionContext),
    );
    MeasureSoftGramPanel.currentPanel = new MeasureSoftGramPanel(panel, extensionContext, statusBar, settingsDeps);
    return MeasureSoftGramPanel.currentPanel;
  }

  /** Opções da webview sem instância (render é estático). */
  private _webviewOptionsFor(extensionContext: ExtensionContext) {
    const {Uri} = require('vscode');
    return {
      enableScripts: true,
      localResourceRoots: [
        Uri.joinPath(extensionContext.extensionUri, 'out'),
        Uri.joinPath(extensionContext.extensionUri, 'webview-ui/build'),
      ],
    };
  }

  public override dispose(): void {
    MeasureSoftGramPanel.currentPanel = undefined;
    this._panel.dispose();
    super.dispose();
  }
}
