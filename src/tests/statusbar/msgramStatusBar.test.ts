import * as assert from 'assert';
import {MsgramStatusBar, StatusBarDeps} from '../../statusbar/msgramStatusBar';

function makeFakeItem() {
    return {
        command: undefined as any,
        tooltip: undefined as any,
        text: undefined as any,
        color: undefined as any,
        backgroundColor: undefined as any,
        showCalled: false,
        disposeCalled: false,
        show() {
            this.showCalled = true;
        },
        dispose() {
            this.disposeCalled = true;
        },
    };
}

function makeDeps(item: ReturnType<typeof makeFakeItem>): StatusBarDeps {
    return {
        createStatusBarItem: () => item as any,
        ThemeColor: class {
            constructor(public id: string) {
            }
        } as any,
    };
}

suite('MsgramStatusBar', () => {
    test('configura a barra de status ao criar a classe', () => {
        const item = makeFakeItem();
        new MsgramStatusBar(makeDeps(item));

        assert.strictEqual(item.command, 'msgram.qualityView.focus');
        assert.strictEqual(item.tooltip, 'MeasureSoftGram — clique para abrir');
        assert.strictEqual(item.showCalled, true);
    });

    test('atualiza a barra para o estado de carregamento', () => {
        const item = makeFakeItem();
        const sb = new MsgramStatusBar(makeDeps(item));

        sb.setLoading();

        assert.strictEqual(item.text, '$(sync~spin) MSGRAM: ...');
        assert.strictEqual(item.color, undefined);
        assert.strictEqual(item.backgroundColor, undefined);
    });

    test('mostra a pontuação em verde quando ela é maior ou igual a 0.8', () => {
        const item = makeFakeItem();
        const deps = makeDeps(item);
        const sb = new MsgramStatusBar(deps);

        sb.setScore(0.9, deps);

        assert.strictEqual(item.text, '$(chart-bar) MSGRAM: 0.90');
        assert.strictEqual((item.color as any).id, 'charts.green');
    });

    test('mostra a pontuação em amarelo quando ela está entre 0.6 e 0.8', () => {
        const item = makeFakeItem();
        const deps = makeDeps(item);
        const sb = new MsgramStatusBar(deps);

        sb.setScore(0.7, deps);

        assert.strictEqual((item.color as any).id, 'charts.yellow');
    });

    test('mostra a pontuação em vermelho quando ela é menor que 0.6', () => {
        const item = makeFakeItem();
        const deps = makeDeps(item);
        const sb = new MsgramStatusBar(deps);

        sb.setScore(0.5, deps);

        assert.strictEqual((item.color as any).id, 'charts.red');
    });

    test('atualiza a barra para indicar que não há dados', () => {
        const item = makeFakeItem();
        const sb = new MsgramStatusBar(makeDeps(item));

        sb.setNoData();

        assert.strictEqual(item.text, '$(dash) MSGRAM: sem dados');
        assert.strictEqual(item.color, undefined);
        assert.strictEqual(item.backgroundColor, undefined);
    });

    test('atualiza a barra para o estado de erro', () => {
        const item = makeFakeItem();
        const deps = makeDeps(item);
        const sb = new MsgramStatusBar(deps);

        sb.setError(deps);

        assert.strictEqual(item.text, '$(warning) MSGRAM: erro');
        assert.strictEqual((item.color as any).id, 'statusBarItem.warningForeground');
        assert.strictEqual((item.backgroundColor as any).id, 'statusBarItem.warningBackground');
    });

    test('libera os recursos da barra de status', () => {
        const item = makeFakeItem();
        const sb = new MsgramStatusBar(makeDeps(item));

        sb.dispose();

        assert.strictEqual(item.disposeCalled, true);
    });

    test('setNotConfigured mostra o ícone de engrenagem sem cor de alerta', () => {
        const item = makeFakeItem();
        const bar = new MsgramStatusBar(makeDeps(item));

        bar.setNotConfigured();

        assert.strictEqual(item.text, '$(gear) MSGRAM: configurar');
        assert.strictEqual(item.color, undefined);
        assert.strictEqual(item.backgroundColor, undefined);
    });
});
