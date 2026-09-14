import React, {useCallback, useEffect, useRef} from 'react';
import DOMPurify from 'dompurify';
import {colorizeYaml, escHtml} from '../../utils/helpers.ts';

interface YamlEditorProps {
    value: string;
    onChange: (value: string) => void;
}

export const YamlEditor: React.FC<YamlEditorProps> = ({value, onChange}) => {
    const preRef = useRef<HTMLPreElement>(null);
    const editorRef = useRef<HTMLTextAreaElement>(null);

    const syncPreview = useCallback((raw: string) => {
        if (preRef.current) {
            preRef.current.innerHTML = DOMPurify.sanitize(
                colorizeYaml(escHtml(raw)),
                {
                    ALLOWED_TAGS: ['span'],
                    ALLOWED_ATTR: ['class'],
                    ALLOW_DATA_ATTR: false,
                    ALLOW_ARIA_ATTR: false,
                },
            );
        }
    }, []);

    const syncScroll = useCallback(() => {
        if (editorRef.current && preRef.current) {
            preRef.current.scrollTop = editorRef.current.scrollTop;
            preRef.current.scrollLeft = editorRef.current.scrollLeft;
        }
    }, []);

    useEffect(() => {
        syncPreview(value);
    }, [value, syncPreview]);

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        onChange(val);
        syncPreview(val);
        syncScroll();
    };

    const handleScroll = () => syncScroll();

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        const el = e.currentTarget;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const indent = '  ';
        const newVal = el.value.slice(0, start) + indent + el.value.slice(end);
        onChange(newVal);
        syncPreview(newVal);
        requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = start + indent.length;
        });
    };

    return (
        <div className="fg">
            <div className="yaml-editor-shell">
        <pre
            id="yaml-preview"
            ref={preRef}
            className="yaml-editor-preview"
            aria-hidden="true"
        />
                <textarea
                    id="yaml-editor"
                    ref={editorRef}
                    className="fi yaml-textarea"
                    spellCheck={false}
                    placeholder="Carregando..."
                    value={value}
                    onChange={handleInput}
                    onScroll={handleScroll}
                    onKeyDown={handleKeyDown}
                />
            </div>
        </div>
    );
};
