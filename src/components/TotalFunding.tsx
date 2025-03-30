interface TotalFundingProps {
    amount: string | null;
    isLoading: boolean;
}

export const TotalFunding = ({ amount, isLoading }: TotalFundingProps) => {
    if (isLoading) {
        return (
            <div className="space-y-2">
                <div className="h-4 w-24 bg-gray-200 animate-pulse rounded" />
                <div className="h-6 w-32 bg-gray-200 animate-pulse rounded" />
            </div>
        )
    }
    
    return (
        <div>
            <h2 className="text-sm text-gray-500">Total Funding</h2>
            <p className="text-lg font-semibold">{amount || 'Not available'}</p>
        </div>
    )
}

