import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

function normalizeMarkdown(content: string) {
  // Tabs at line start are interpreted as code blocks in Markdown.
  // Replace them with two spaces for predictable text formatting.
  return content.replace(/\t/g, '  ');
}

const sanitizedSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'h1', 'h2', 'h3', 'h4', 'span'],
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), 'href', 'target', 'rel'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
  },
};

export function SafeMarkdown({ content, className }: SafeMarkdownProps) {
  const normalizedContent = normalizeMarkdown(content);

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizedSchema]]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary underline underline-offset-4 hover:opacity-80 transition-opacity"
            >
              {children}
            </a>
          ),
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
