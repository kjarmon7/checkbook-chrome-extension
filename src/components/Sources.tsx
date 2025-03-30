interface SourcesProps {
    sources: string[];
    isLoading: boolean;
}

export const Sources = ({ sources, isLoading }: SourcesProps) => {
    if (isLoading) {
        return (
            <div className="text-center space-y-2">
                <div className="h-4 w-16 bg-gray-200 animate-pulse rounded mx-auto" />
                <div className="space-y-2">
                    <div className="h-4 w-48 bg-gray-200 animate-pulse rounded mx-auto" />
                    <div className="h-4 w-56 bg-gray-200 animate-pulse rounded mx-auto" />
                    <div className="h-4 w-40 bg-gray-200 animate-pulse rounded mx-auto" />
                </div>
            </div>
        );
    }

    return (
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
};


