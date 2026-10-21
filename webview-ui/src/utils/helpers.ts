export function now(): string {
    return new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

export function escHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** "há 2 dias", "há 3 horas", "há 5 minutos" ou "agora há pouco". */
export function formatRelative(iso: string, now: Date = new Date()): string {
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return 'data desconhecida';
    const diffSec = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
    if (diffSec < 60) return 'agora há pouco';
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `há ${min} minuto${min === 1 ? '' : 's'}`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} hora${h === 1 ? '' : 's'}`;
    const d = Math.floor(h / 24);
    return `há ${d} dia${d === 1 ? '' : 's'}`;
}

/** Data e hora absolutas em pt-BR, para tooltips. */
export function formatAbsolute(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', {dateStyle: 'short', timeStyle: 'short'});
}

export type StatusColor = 'ok' | 'warn' | 'fail';

export function getCharStatus(value: number, goal: number | null): StatusColor {
    if (goal === null) return 'ok';
    if (value >= goal) return 'ok';
    if (value >= goal * 0.9) return 'warn';
    return 'fail';
}

export function getStatusColor(status: StatusColor): string {
    return {ok: '#4ec9b0', warn: '#cca700', fail: '#f14c4c'}[status];
}

export function colorizeYaml(escaped: string): string {
    return escaped
        .replace(/(#.*)$/gm, '<span class="yaml-cmm">$1</span>')
        .replace(/^([ \t]*)([\w-]+):/gm, '$1<span class="yaml-key">$2</span>:')
        .replace(/:\s+(&quot;.*?&quot;)/g, ': <span class="yaml-val">$1</span>')
        .replace(/:\s+(&#039;.*?&#039;)/g, ': <span class="yaml-val">$1</span>')
        .replace(/:\s+(true|false)/g, ': <span class="yaml-kw">$1</span>')
        .replace(/:\s+(\d+)/g, ': <span class="yaml-num">$1</span>')
        .replace(/(\$\{\{.*?\}\})/g, '<span class="yaml-bl">$1</span>');
}