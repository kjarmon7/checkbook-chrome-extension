interface CompanyNameProps {
    name: string;
}

export const CompanyName = ({ name }: CompanyNameProps ) => (
    <div className="text-2xl text-center">
        { name }
    </div>
)


// interface TitleProps {
//     className?: string;
// }

// export const Title = ({ className }: TitleProps) => {
//   return (
//     <div className={`text-2xl text-center ${className}`}>
//         Company Name
//     </div>
//   )  
// };
