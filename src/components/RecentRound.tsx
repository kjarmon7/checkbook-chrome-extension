interface RecentRoundProps {
    data: {
      amount?: string;
      date?: string;
      type?: string;
    };
    isLoading: boolean;
}

export const RecentRound = ({ data, isLoading }: RecentRoundProps) => {
    if (isLoading) {
        return (
            <div className="text-center space-y-2">
                <div className="h-4 w-24 bg-gray-200 animate-pulse rounded mx-auto" />
                <div className="h-8 w-32 bg-gray-200 animate-pulse rounded mx-auto" />
                <div className="h-3 w-20 bg-gray-200 animate-pulse rounded mx-auto" />
                <div className="h-3 w-16 bg-gray-200 animate-pulse rounded mx-auto" />
            </div>
        );
    }

    return (
        <div className="text-center">
            <div className="text-sm">Most Recent Round</div>
            {data.type && <div className="text-2xl"> { data.type } </div> }
            {data.amount && <div className="text-xs"> { data.amount } </div>}
            {data.date && <div className="text-xs"> { data.date } </div>}
        </div>
    );
};
