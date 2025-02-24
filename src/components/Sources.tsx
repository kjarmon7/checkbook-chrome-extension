interface SourcesProps {
    sources: string[];
}

export const Sources = ( { sources }: SourcesProps ) => (
    <div className="text-center">
        <div className="text-sm">Sources</div>
        <ul className="list-disc pl-5">
            {sources.map((source, index) => (
                <li key={index}> { source } </li>
            ))}
        </ul>
    </div>
);


// export const Sources = ({ className }: SourcesProps) => {
//     return (
//         <div className={`text-center ${className}`}>
//             <div className="text-sm">Sources</div>
//             <div className="text-base">https://www.crunchbase.com/organization/earnin</div>
//             <div className="text-base">https://techcrunch.com/2018/12/20/earnin-raises-125m/</div>
//             <div className="text-base">https://www.cbinsights.com/company/activehours/financials</div>
//         </div>
//     )
// }