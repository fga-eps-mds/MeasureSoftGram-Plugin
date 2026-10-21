import type {SettingsForUi} from '../types';

/** Campos que a interface conhece sobre as configurações, com flags de token. */
export type YamlSettings = Partial<SettingsForUi> & {
    /** @deprecated o valor nunca vai para o YAML; só a flag importa */
    githubToken?: string;
    /** @deprecated idem */
    msgramServiceToken?: string;
};

/** Escapa um valor para dentro de aspas duplas em YAML. */
export function quoteYaml(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Atualiza, dentro do YAML, apenas as linhas dos 5 inputs configuráveis
 * (githubToken, sonarProjectKey, msgramServiceToken, productName, workflowName),
 * preservando indentação, comentários e qualquer outra edição manual no resto
 * do arquivo. Tokens nunca são escritos: viram referências a secrets.
 */
export function applySettingsToYaml(yaml: string, settings: YamlSettings): string {
    const hasGithub = !!settings.hasGithubToken || !!settings.githubToken;
    const hasMsgram = !!settings.hasMsgramToken || !!settings.msgramServiceToken;

    const replacements: Record<string, string | undefined> = {
        githubToken: hasGithub ? '${{ secrets.GITHUB_TOKEN }}' : undefined,
        msgramServiceToken: hasMsgram ? '${{ secrets.MSGRAM_TOKEN }}' : undefined,
        sonarProjectKey: settings.sonarProjectKey ? quoteYaml(settings.sonarProjectKey) : undefined,
        productName: settings.productName ? quoteYaml(settings.productName) : undefined,
        workflowName: settings.workflowName ? quoteYaml(settings.workflowName) : undefined,
    };

    const keys = Object.keys(replacements);

    const lines = yaml.split('\n').map((line) => {
        for (const key of keys) {
            const newValue = replacements[key];
            if (newValue === undefined) continue;

            const re = new RegExp(`^(\\s*)(${key}):\\s*([^#]*)?(#.*)?$`);
            const match = line.match(re);

            if (match) {
                const [, indent, matchedKey, , comment] = match;
                return `${indent}${matchedKey}: ${newValue}${comment ? ' ' + comment : ''}`;
            }
        }
        return line;
    });

    return lines.join('\n');
}
