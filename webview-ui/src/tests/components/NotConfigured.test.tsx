import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {NotConfiguredView} from '../../components/NotConfiguredView';

describe('NotConfiguredView', () => {
    it('explica que a extensão não está configurada', () => {
        render(<NotConfiguredView missing={['token']} onOpenSettings={() => {}} onOpenVscodeSettings={() => {}}/>);
        expect(screen.getByText(/não está configurad/i)).toBeInTheDocument();
    });

    it('lista cada campo faltante com rótulo legível', () => {
        render(
            <NotConfiguredView
                missing={['token', 'serviceUrl', 'productName']}
                onOpenSettings={() => {}}
                onOpenVscodeSettings={() => {}}
            />,
        );
        expect(screen.getByText(/token do measuresoftgram/i)).toBeInTheDocument();
        expect(screen.getByText(/url do serviço/i)).toBeInTheDocument();
        expect(screen.getByText(/nome do produto/i)).toBeInTheDocument();
    });

    it('não mostra campos que não faltam', () => {
        render(<NotConfiguredView missing={['token']} onOpenSettings={() => {}} onOpenVscodeSettings={() => {}}/>);
        expect(screen.queryByText(/nome do produto/i)).not.toBeInTheDocument();
    });

    it('botão "Abrir Settings" chama onOpenSettings', () => {
        const onOpenSettings = vi.fn();
        render(<NotConfiguredView missing={['token']} onOpenSettings={onOpenSettings} onOpenVscodeSettings={() => {}}/>);
        fireEvent.click(screen.getByRole('button', {name: /abrir settings/i}));
        expect(onOpenSettings).toHaveBeenCalledTimes(1);
    });

    it('botão "settings.json" chama onOpenVscodeSettings', () => {
        const onOpenVscodeSettings = vi.fn();
        render(<NotConfiguredView missing={['token']} onOpenSettings={() => {}} onOpenVscodeSettings={onOpenVscodeSettings}/>);
        fireEvent.click(screen.getByRole('button', {name: /settings\.json/i}));
        expect(onOpenVscodeSettings).toHaveBeenCalledTimes(1);
    });

    it('com repositório não cadastrado mostra o aviso e o botão "Cadastrar automaticamente"', () => {
        const onRegisterRepo = vi.fn();
        render(<NotConfiguredView missing={['productName']} unregisteredRepo="meu-repo" onOpenSettings={() => {}} onOpenVscodeSettings={() => {}} onRegisterRepo={onRegisterRepo}/>);
        expect(screen.getByTestId('unregistered-repo')).toHaveTextContent('meu-repo');
        fireEvent.click(screen.getByTestId('register-repo'));
        expect(onRegisterRepo).toHaveBeenCalledTimes(1);
    });

    it('sem repositório não cadastrado não mostra o botão de cadastro', () => {
        render(<NotConfiguredView missing={['token']} onOpenSettings={() => {}} onOpenVscodeSettings={() => {}} onRegisterRepo={() => {}}/>);
        expect(screen.queryByTestId('register-repo')).not.toBeInTheDocument();
    });

    it('nunca exibe score, repositório de exemplo ou aviso de meta', () => {
        const {container} = render(<NotConfiguredView missing={['token']} onOpenSettings={() => {}} onOpenVscodeSettings={() => {}}/>);
        expect(container.textContent).not.toMatch(/0\.94|mock-repo|abaixo da meta/i);
    });
});
