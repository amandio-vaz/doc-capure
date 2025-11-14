import { Chapter, Documentation } from '../types';

export function downloadAsFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function generateAndDownloadMarkdown(doc: Documentation) {
    const markdownContent = `# ${doc.title}\n\n` +
        doc.chapters.map(chapter => `## ${chapter.title}\n\n${chapter.content}`).join('\n\n---\n\n');
    
    const filename = `${doc.title.replace(/\s+/g, '_').toLowerCase()}.md`;
    downloadAsFile(markdownContent, filename, 'text/markdown;charset=utf-8');
}

function createHtmlContent(doc: Documentation): string {
    const markdownContent = `# ${doc.title}\n\n` +
        doc.chapters.map(chapter => `## ${chapter.title}\n\n${chapter.content}`).join('\n\n---\n\n');

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${doc.title}</title>
    <script src="https://cdn.jsdelivr.net/npm/showdown/dist/showdown.min.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #e5e7eb;
            background-color: #111827;
            margin: 0;
            padding: 2rem;
        }
        #content {
            max-width: 800px;
            margin: 0 auto;
        }
        h1, h2, h3 {
            color: #f9fafb;
            border-bottom: 1px solid #374151;
            padding-bottom: 0.3em;
        }
        code {
            background-color: #1f2937;
            padding: 0.2em 0.4em;
            border-radius: 6px;
            font-family: 'Courier New', Courier, monospace;
            font-size: 85%;
        }
        pre {
            background-color: #1f2937;
            border: 1px solid #374151;
            border-radius: 8px;
            padding: 1em;
            overflow-x: auto;
        }
        pre code {
            background-color: transparent;
            padding: 0;
        }
        a {
            color: #60a5fa;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        blockquote {
            border-left: 4px solid #4b5563;
            padding-left: 1em;
            color: #9ca3af;
            margin-left: 0;
        }
    </style>
</head>
<body>
    <div id="content"></div>
    <textarea id="markdown" style="display:none;">${markdownContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
    </textarea>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            var converter = new showdown.Converter({
                ghCompatibleHeaderId: true,
                simpleLineBreaks: true,
                ghMentions: true,
                tables: true
            });
            var text = document.getElementById('markdown').value;
            var html = converter.makeHtml(text);
            document.getElementById('content').innerHTML = html;
        });
    </script>
</body>
</html>
    `;
}

export function generateAndDownloadHtml(doc: Documentation) {
    const htmlContent = createHtmlContent(doc);
    const filename = `${doc.title.replace(/\s+/g, '_').toLowerCase()}.html`;
    downloadAsFile(htmlContent, filename, 'text/html;charset=utf-8');
}

export function generateAndPrint(doc: Documentation) {
    const htmlContent = createHtmlContent(doc);
    const printWindow = window.open('', '_blank');
    if(printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        // Delay print to allow content to render
        setTimeout(() => {
            printWindow.print();
        }, 500);
    }
}