/**
 * Canal de saída compartilhado por painel e barra lateral.
 * Criado sob demanda para que os testes unitários não precisem do `vscode`
 * até alguém realmente logar algo.
 */
export interface OutputChannelLike {
  appendLine(value: string): void;

  show(preserveFocus?: boolean): void;

  dispose(): void;
}

let channel: OutputChannelLike | undefined;

export function getOutputChannel(): OutputChannelLike {
  if (!channel) {
    const vscode = require('vscode');
    channel = vscode.window.createOutputChannel('MeasureSoftGram API');
  }
  return channel!;
}

/** Só para testes. */
export function setOutputChannelForTests(fake: OutputChannelLike | undefined): void {
  channel = fake;
}

export function timestamp(): string {
  return new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit', second: '2-digit'});
}
