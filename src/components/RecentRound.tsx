interface RecentRoundProps {
    data: {
      amount: string;
      date: string;
      type: string;
    };
}

export const RecentRound = ({ data }: RecentRoundProps) => (
  <div className="text-center">
    <div className="text-sm">Most Recent Round</div>
    <div className="text-2xl"> { data.type } </div>
    <div className="text-xs"> { data.amount } </div>
    <div className="text-xs"> { data.date } </div>
  </div>
  
);
