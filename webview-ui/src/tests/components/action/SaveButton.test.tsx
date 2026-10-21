import {fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {SaveButton} from '../../../components/action/SaveButton';

describe('SaveButton', () => {
    const onSave = vi.fn();

    beforeEach(() => {
        onSave.mockClear();
    });

    it('deve renderizar o botão com texto "Salvar"', () => {
        render(<SaveButton onSave={onSave} savedFeedback={false}/>);
        expect(screen.getByRole('button')).toHaveTextContent('Salvar');
    });

    it('deve chamar onSave ao clicar no botão', () => {
        render(<SaveButton onSave={onSave} savedFeedback={false}/>);
        fireEvent.click(screen.getByRole('button'));
        expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('não deve exibir o feedback quando savedFeedback é false', () => {
        render(<SaveButton onSave={onSave} savedFeedback={false}/>);
        expect(screen.queryByText(/Salvo no seu perfil/i)).not.toBeInTheDocument();
    });

    it('deve exibir o feedback quando savedFeedback é true', () => {
        render(<SaveButton onSave={onSave} savedFeedback={true}/>);
        expect(screen.getByText(/Salvo no seu perfil/i)).toBeInTheDocument();
    });

    it('deve exibir ícone de check no feedback quando savedFeedback é true', () => {
        render(<SaveButton onSave={onSave} savedFeedback={true}/>);
        const feedback = screen.getByText(/Salvo no seu perfil/i).closest('span');
        expect(feedback?.querySelector('i')).toHaveClass('codicon-check');
    });

    it('deve exibir ícone de floppy no botão', () => {
        render(<SaveButton onSave={onSave} savedFeedback={false}/>);
        expect(screen.getByRole('button').querySelector('i')).toHaveClass('codicon-save');
    });
});