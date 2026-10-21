import {ExtensionContext, Webview, WebviewView, WebviewViewProvider} from 'vscode';
import {MeasureSoftGramBase} from './measureSoftGramBase';
import type {MsgramStatusBar} from '../statusbar/msgramStatusBar';
import type {SettingsDeps} from '../config/settings';

/** Barra lateral: só o ciclo de vida do WebviewView. A lógica está na base. */
export class MeasureSoftGramSidebar extends MeasureSoftGramBase implements WebviewViewProvider {
  public static readonly viewType = 'msgram.sidebarView';

  private _view?: WebviewView;

  constructor(extensionContext: ExtensionContext, statusBar?: MsgramStatusBar, settingsDeps?: SettingsDeps) {
    super(extensionContext, statusBar, settingsDeps);
  }

  protected get _webview(): Webview | undefined {
    return this._view?.webview;
  }

  public resolveWebviewView(webviewView: WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = this._webviewOptions();
    webviewView.webview.html = this._getWebviewContent(webviewView.webview, this._extensionContext.extensionUri);

    const listener = webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });
    this._disposables.push(listener);
    this._extensionContext.subscriptions?.push(listener);
  }
}
