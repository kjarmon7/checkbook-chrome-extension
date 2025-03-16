interface SourcesProps {
    sources: string[];
}

export const Sources = ( { sources }: SourcesProps ) => (
    <div className="text-center">
        <div className="text-sm">Sources</div>
        <ul className="list-disc pl-5">
            {sources.map((source, index) => (
                <li key={index}>
                    <a 
                        href={source} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-blue-500 hover:underline truncate block"
                    >
                        {source}
                    </a>
                </li>
            ))}
        </ul>
    </div>
);


