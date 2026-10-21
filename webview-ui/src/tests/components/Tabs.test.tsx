import {fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Tabs} from '../../components/Tabs';
import type {TabName} from '../../types';

const TabsTest: { id: TabName; label: string; icon: string }[] = [
    {id: 'dashboard', label: 'Painel', icon: 'codicon-dashboard'},
    {id: 'settings', label: 'Config', icon: 'codicon-settings-gear'},
    {id: 'action', label: 'Action', icon: 'codicon-file-code'},
];

describe('Tabs', () => {
    const onSelect = vi.fn();

    beforeEach(() => {
        onSelect.mockClear();
    });

    it('deve renderizar as 3 abas', () => {
        render(<Tabs active="dashboard" onSelect={onSelect}/>);
        expect(screen.getAllByText(/Painel|Config|Action/)).toHaveLength(3);
    });

    it.each(TabsTest)('deve renderizar o label "$label" da aba "$id"', ({label}) => {
        render(<Tabs active="dashboard" onSelect={onSelect}/>);
        expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
    });

    it.each(TabsTest)('deve renderizar o id "tab-$id" na aba "$id"', ({id}) => {
        render(<Tabs active="dashboard" onSelect={onSelect}/>);
        expect(document.getElementById(`tab-${id}`)).toBeInTheDocument();
    });

    it.each(TabsTest)('deve renderizar o ícone "$icon" na aba "$id"', ({icon}) => {
        render(<Tabs active="dashboard" onSelect={onSelect}/>);
        const tab = document.getElementById(`tab-${TabsTest[0].id}`)!.parentElement!;
        const icons = tab.querySelectorAll(`i.codicon.${icon}`);
        expect(icons.length).toBeGreaterThan(0);
    });

    it.each(TabsTest)('deve aplicar a classe "on" apenas na aba ativa "$id"', ({id}) => {
        render(<Tabs active={id} onSelect={onSelect}/>);
        const activeTab = document.getElementById(`tab-${id}`)!;
        expect(activeTab).toHaveClass('on');

        TabsTest.filter((t) => t.id !== id).forEach((t) => {
            expect(document.getElementById(`tab-${t.id}`)).not.toHaveClass('on');
        });
    });

    it.each(TabsTest)('deve chamar onSelect com "$id" ao clicar na aba "$id"', ({id, label}) => {
        render(<Tabs active="dashboard" onSelect={onSelect}/>);
        fireEvent.click(screen.getByText(new RegExp(label)));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith(id);
    });

    it('não deve chamar onSelect sem interação', () => {
        render(<Tabs active="dashboard" onSelect={onSelect}/>);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('deve chamar onSelect uma vez por clique', () => {
        render(<Tabs active="dashboard" onSelect={onSelect}/>);
        fireEvent.click(screen.getByText(/Config/));
        fireEvent.click(screen.getByText(/Action/));
        expect(onSelect).toHaveBeenCalledTimes(2);
    });

    it('deve renderizar o container com a classe "tabs"', () => {
        const {container} = render(<Tabs active="dashboard" onSelect={onSelect}/>);
        expect(container.firstChild).toHaveClass('tabs');
    });

    it('cada aba deve ter a classe "tab"', () => {
        render(<Tabs active="dashboard" onSelect={onSelect}/>);
        TabsTest.forEach(({id}) => {
            expect(document.getElementById(`tab-${id}`)).toHaveClass('tab');
        });
    });
});