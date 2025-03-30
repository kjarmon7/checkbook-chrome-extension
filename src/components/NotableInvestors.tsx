interface NotableInvestorsProps {
    investors: string[];
    isLoading: boolean;
}

export const NotableInvestors = ({ investors, isLoading }: NotableInvestorsProps) => {
    if (isLoading) {
        return (
            <div className="text-center space-y-2">
                <div className="h-4 w-24 bg-gray-200 animate-pulse rounded mx-auto" />
                <div className="space-y-2">
                    <div className="h-4 w-32 bg-gray-200 animate-pulse rounded mx-auto" />
                    <div className="h-4 w-28 bg-gray-200 animate-pulse rounded mx-auto" />
                    <div className="h-4 w-36 bg-gray-200 animate-pulse rounded mx-auto" />
                </div>
            </div>
        );
    }

    return (
        <div className="text-center">
            <div className="text-sm">Notable Investors</div>
            <ul className="list-disc pl-5">
                {investors.map((investors, index) => (
                    <li key={index}> { investors } </li>
                ))}
            </ul>
        </div>
    );
};