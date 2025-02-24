interface TotalFundingProps {
    amount: string;
}

export const TotalFunding = ({ amount }: TotalFundingProps) => {
    return (
        <div className="text-center">
            <div className="text-sm">Total Funding</div>
            <div className="text-green-500 text-2xl">{ amount }</div>
        </div>
    )
}

