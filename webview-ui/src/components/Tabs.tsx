import React from 'react';
import type {TabName} from '../types';

interface Tab {
    id: TabName;
    label: string;
    icon: string;
}

const TABS: Tab[] = [
    {id: 'dashboard', label: 'Painel',  icon: 'codicon-dashboard'},
    {id: 'grafana',   label: 'Grafana', icon: 'codicon-graph-line'},
    {id: 'settings',  label: 'Config',  icon: 'codicon-settings-gear'},
    {id: 'action',    label: 'Action',  icon: 'codicon-file-code'},
];

interface TabsProps {
    active: TabName;
    onSelect: (tab: TabName) => void;
}

export const Tabs: React.FC<TabsProps> = ({active, onSelect}) => (
    <div className="tabs">
        {TABS.map((t) => (
            <div
                key={t.id}
                id={`tab-${t.id}`}
                className={`tab${active === t.id ? ' on' : ''}`}
                onClick={() => onSelect(t.id)}
            >
                <i className={`codicon ${t.icon}`}/> {t.label}
            </div>
        ))}
    </div>
);