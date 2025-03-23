interface RecentRoundProps {
    data: {
      amount?: string;
      date?: string;
      type?: string;
    };
}

export const RecentRound = ({ data }: RecentRoundProps) => (
  <div className="text-center">
    <div className="text-sm">Most Recent Round</div>
    {data.type && <div className="text-2xl"> { data.type } </div> }
    {data.amount && <div className="text-xs"> { data.amount } </div>}
    {data.date && <div className="text-xs"> { data.date } </div>}
  </div>
  
);
