import type {SettingsForUi} from '../types';

type Checkable = Partial<SettingsForUi>;

const REQUIRED_FIELDS: { key: keyof SettingsForUi; label: string }[] = [
    {key: 'hasGithubToken', label: 'GitHub Token'},
    {key: 'hasMsgramToken', label: 'MSGRAM Service Token'},
    {key: 'productName', label: 'Product Name'},
    {key: 'workflowName', label: 'Workflow Name'},
];

function isFilled(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().length > 0;
    return false;
}

/** Campos obrigatórios para executar a Action. Tokens são checados pelas flags. */
export function getMissingSettings(settings: Checkable): { key: string; label: string }[] {
    return REQUIRED_FIELDS.filter((field) => !isFilled(settings[field.key]));
}
