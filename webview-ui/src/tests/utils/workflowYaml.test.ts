import {describe, expect, it} from 'vitest';
import {applySettingsToYaml} from '../../utils/workflowYaml';
import {DEFAULT_WORKFLOW_YAML} from '../../utils/defaultWorkflow';

describe('applySettingsToYaml', () => {
    it('deve substituir githubToken pelo secret quando hasGithubToken', () => {
        const result = applySettingsToYaml(DEFAULT_WORKFLOW_YAML, {hasGithubToken: true});
        expect(result).toContain('githubToken: ${{ secrets.GITHUB_TOKEN }}');
    });

    it('deve substituir msgramServiceToken pelo secret quando hasMsgramToken', () => {
        const result = applySettingsToYaml(DEFAULT_WORKFLOW_YAML, {hasMsgramToken: true});
        expect(result).toContain('msgramServiceToken: ${{ secrets.MSGRAM_TOKEN }}');
    });

    it('nunca escreve o valor do token no YAML', () => {
        const result = applySettingsToYaml(DEFAULT_WORKFLOW_YAML, {hasGithubToken: true, githubToken: 'ghp_segredo'});
        expect(result).not.toContain('ghp_segredo');
        expect(result).toContain('${{ secrets.GITHUB_TOKEN }}');
    });

    it('escapa aspas duplas e barras invertidas nos valores', () => {
        const result = applySettingsToYaml(DEFAULT_WORKFLOW_YAML, {
            productName: 'Prod "X" \\ Y',
            sonarProjectKey: 'a"b',
        });
        expect(result).toContain('productName: "Prod \\"X\\" \\\\ Y"');
        expect(result).toContain('sonarProjectKey: "a\\"b"');
    });

    it('deve substituir sonarProjectKey com aspas quando preenchido', () => {
        const result = applySettingsToYaml(DEFAULT_WORKFLOW_YAML, {
            sonarProjectKey: 'meu-projeto',
        });
        expect(result).toContain('sonarProjectKey: "meu-projeto"');
    });

    it('deve substituir productName com aspas quando preenchido', () => {
        const result = applySettingsToYaml(DEFAULT_WORKFLOW_YAML, {
            productName: 'Measure',
        });
        expect(result).toContain('productName: "Measure"');
    });

    it('deve substituir workflowName com aspas quando preenchido', () => {
        const result = applySettingsToYaml(DEFAULT_WORKFLOW_YAML, {
            workflowName: 'Build',
        });
        expect(result).toContain('workflowName: "Build"');
    });

    it('não deve substituir campo quando valor é undefined', () => {
        const original = DEFAULT_WORKFLOW_YAML;
        const result = applySettingsToYaml(original, {});
        expect(result).toBe(original);
    });

    it('deve preservar comentários da linha ao substituir', () => {
        const yaml = `        githubToken: # Token do GitHub`;
        const result = applySettingsToYaml(yaml, {hasGithubToken: true});
        expect(result).toContain('# Token do GitHub');
        expect(result).toContain('${{ secrets.GITHUB_TOKEN }}');
    });

    it('deve substituir múltiplos campos de uma vez', () => {
        const result = applySettingsToYaml(DEFAULT_WORKFLOW_YAML, {
            hasGithubToken: true,
            productName: 'produto',
            workflowName: 'Build',
        });
        expect(result).toContain('githubToken: ${{ secrets.GITHUB_TOKEN }}');
        expect(result).toContain('productName: "produto"');
        expect(result).toContain('workflowName: "Build"');
    });

    it('deve preservar linhas não relacionadas às configurações', () => {
        const result = applySettingsToYaml(DEFAULT_WORKFLOW_YAML, {hasGithubToken: true});
        expect(result).toContain('runs-on: ubuntu-latest');
        expect(result).toMatch(/uses: actions\/checkout@v[34]/);
    });
});