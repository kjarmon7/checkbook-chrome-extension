interface NotableInvestorsProps {
    investors: string[];
}

export const NotableInvestors = ({ investors }: NotableInvestorsProps) => (
    <div className="text-center">
        <div className="text-sm">Notable Investors</div>
        <ul className="list-disc pl-5">
            {investors.map((investors, index) => (
                <li key={index}> { investors } </li>
            ))}
        </ul>
    </div>
);