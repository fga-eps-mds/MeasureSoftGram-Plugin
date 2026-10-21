import {describe, expect, it} from 'vitest';
import {DEFAULT_WORKFLOW_YAML} from '../../utils/defaultWorkflow';

describe('DEFAULT_WORKFLOW_YAML', () => {
    it('deve conter o nome do workflow', () => {
        expect(DEFAULT_WORKFLOW_YAML).toContain('name: MeasureSoftGram');
    });

    it('deve conter os campos configuráveis', () => {
        expect(DEFAULT_WORKFLOW_YAML).toContain('githubToken:');
        expect(DEFAULT_WORKFLOW_YAML).toContain('sonarProjectKey:');
        expect(DEFAULT_WORKFLOW_YAML).toContain('msgramServiceToken:');
        expect(DEFAULT_WORKFLOW_YAML).toContain('productName:');
        expect(DEFAULT_WORKFLOW_YAML).toContain('workflowName:');
    });

    it('deve ser uma string não vazia', () => {
        expect(DEFAULT_WORKFLOW_YAML).toBeTruthy();
        expect(typeof DEFAULT_WORKFLOW_YAML).toBe('string');
    });

    it('dispara por workflow_dispatch (execução local) além de workflow_run', () => {
        expect(DEFAULT_WORKFLOW_YAML).toMatch(/^\s*workflow_dispatch:/m);
        expect(DEFAULT_WORKFLOW_YAML).toContain('workflow_run:');
    });

    it('só roda após build com sucesso ou por dispatch', () => {
        expect(DEFAULT_WORKFLOW_YAML).toContain("github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'");
    });

    it('usa checkout@v4 e a Action fixada em 2.1.5', () => {
        expect(DEFAULT_WORKFLOW_YAML).toContain('actions/checkout@v4');
        expect(DEFAULT_WORKFLOW_YAML).toContain('fga-eps-mds/MeasureSoftGram-Action@2.1.5');
    });

    it('tokens são referências a secrets, nunca valores', () => {
        expect(DEFAULT_WORKFLOW_YAML).toContain('githubToken: ${{ secrets.GITHUB_TOKEN }}');
        expect(DEFAULT_WORKFLOW_YAML).toContain('msgramServiceToken: ${{ secrets.MSGRAM_TOKEN }}');
    });
});
