import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ExternalLink } from "lucide-react"
import { CompanyData } from '../types/company';

// Enhanced thinking animation component with pulsing text
const ThinkingAnimation = ({ text, isActive }: { text: string; isActive: boolean }) => {
  return (
    <div className="h-6 text-center text-sm text-gray-500 flex items-center justify-center">
      {isActive ? (
        <>
          <motion.span
            animate={{
              opacity: [0.7, 1, 0.7],
              scale: [0.98, 1, 0.98],
            }}
            transition={{
              duration: 2,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
            }}
          >
            {text}
          </motion.span>
          <div className="flex ml-1 space-x-1">
            <motion.span
              className="inline-block w-1 h-1 rounded-full bg-gray-500"
              animate={{ scale: [0.5, 1, 0.5], opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, delay: 0 }}
            />
            <motion.span
              className="inline-block w-1 h-1 rounded-full bg-gray-500"
              animate={{ scale: [0.5, 1, 0.5], opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, delay: 0.3 }}
            />
            <motion.span
              className="inline-block w-1 h-1 rounded-full bg-gray-500"
              animate={{ scale: [0.5, 1, 0.5], opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, delay: 0.6 }}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

// Individual receipt section components
const ReceiptHeader = ({ name }: { name: string }) => (
  <div className="border-b border-dashed border-gray-300 py-3 text-center">
    <h2 className="text-xl font-mono">{name}</h2>
  </div>
)

const TotalFundingSection = ({ amount }: { amount: string }) => (
  <div className="border-b border-dashed border-gray-300 py-3">
    <div className="flex justify-between">
      <span className="font-mono">Total Funding:</span>
      <span className="font-mono font-semibold">{amount}</span>
    </div>
  </div>
)

const RecentFundingSection = ({
  type,
  amount,
  date,
}: {
  type: string
  amount: string
  date: string
}) => (
  <div className="border-b border-dashed border-gray-300 py-3">
    <h3 className="font-mono mb-2 text-center">Recent Funding</h3>
    <div className="flex justify-between mb-1">
      <span className="font-mono">Round:</span>
      <span className="font-mono">{type}</span>
    </div>
    <div className="flex justify-between mb-1">
      <span className="font-mono">Raised:</span>
      <span className="font-mono">{amount}</span>
    </div>
    <div className="flex justify-between">
      <span className="font-mono">Date:</span>
      <span className="font-mono">{date}</span>
    </div>
  </div>
)

const InvestorsSection = ({ investors }: { investors: string[] }) => (
  <div className="border-b border-dashed border-gray-300 py-3">
    <h3 className="font-mono mb-2 text-center">Notable Investors</h3>
    <ul className="space-y-1">
      {investors.map((investor, index) => (
        <li key={index} className="font-mono text-center">
          {investor}
        </li>
      ))}
    </ul>
  </div>
)

const SourcesSection = ({ sources }: { sources: string[] }) => (
  <div className="py-3">
    <h3 className="font-mono mb-2 text-center">Sources</h3>
    <ul className="space-y-1">
      {sources.map((source, index) => (
        <li key={index} className="font-mono text-sm text-blue-500 flex items-center justify-center">
          <a href={source} className="hover:underline flex items-center">
            {source.substring(0, 30)}...
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </li>
      ))}
    </ul>
  </div>
)

// Animation variants
const sectionVariants = {
  hidden: {
    opacity: 0,
    height: 0,
    marginBottom: 0,
  },
  visible: {
    opacity: 1,
    height: "auto",
    marginBottom: "0.5rem",
    transition: {
      duration: 0.5,
      ease: "easeInOut",
    },
  },
  exit: {
    opacity: 0,
    height: 0,
    marginBottom: 0,
    transition: {
      duration: 0.3,
      ease: "easeInOut",
    },
  },
}

interface ReceiptProps {
    data: Partial<CompanyData>;
    loading: boolean;
    animationSpeed: number;
}

// Main Receipt Component
export const Receipt = ({
  data,
  loading = false,
  animationSpeed = 1000,
}: ReceiptProps) => {
  const [visibleSections, setVisibleSections] = useState<string[]>([])
  const [isPrinting, setIsPrinting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  // Reset and start animation when data changes or loading state changes
  useEffect(() => {
    if (loading) {
      setVisibleSections([])
      setIsPrinting(true)
      setIsComplete(false)
      return
    }

    const sections: string[] = []
    const expectedSections: string[] = []

    // Build list of expected sections
    if (data.name) {
      expectedSections.push("name")
      if (data.totalFunding) expectedSections.push("totalFunding")
      if (data.recentRound) expectedSections.push("recentRound")
      if (data.notableInvestors && data.notableInvestors.length > 0) expectedSections.push("notableInvestors")
      if (data.sources && data.sources.length > 0) expectedSections.push("sources")
    }

    // Always show company name first
    if (data.name) {
      sections.push("name")
      setIsPrinting(true)
      setIsComplete(false)

      // Simulate printing animation by revealing sections one by one
      const revealSection = (section: string, delay: number) => {
        setTimeout(() => {
          setVisibleSections((prev) => [...prev, section])

          // Check if this is the last section
          if (section === expectedSections[expectedSections.length - 1]) {
            setTimeout(() => {
              setIsPrinting(false)
              setIsComplete(true)
            }, 500)
          }
        }, delay)
      }

      if (data.totalFunding) {
        revealSection("totalFunding", animationSpeed)
      }

      if (data.recentRound) {
        revealSection("recentRound", animationSpeed * 2)
      }

      if (data.notableInvestors && data.notableInvestors.length > 0) {
        revealSection("notableInvestors", animationSpeed * 3)
      }

      if (data.sources && data.sources.length > 0) {
        revealSection("sources", animationSpeed * 4)
      }

      // If there's only one section, mark as complete after it appears
      if (expectedSections.length === 1) {
        setTimeout(() => {
          setIsPrinting(false)
          setIsComplete(true)
        }, animationSpeed)
      }
    }

    setVisibleSections(sections)
  }, [data, loading, animationSpeed])

  return (
    <div className="bg-white rounded-lg shadow-md p-4 max-w-sm mx-auto font-mono">
      <div className="mb-2 h-6">
        <AnimatePresence mode="wait">
          {isPrinting && (
            <motion.div
              key="printing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ThinkingAnimation text="Printing funding information" isActive={true} />
            </motion.div>
          )}
          {isComplete && !isPrinting && (
            <motion.div
              key="complete"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center text-sm text-green-600"
            >
              Print complete
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="border border-gray-200 rounded p-4 bg-white">
        <AnimatePresence>
          {visibleSections.includes("name") && data.name && (
            <motion.div key="header" initial="hidden" animate="visible" exit="exit" variants={sectionVariants}>
              <ReceiptHeader name={data.name} />
            </motion.div>
          )}

          {visibleSections.includes("totalFunding") && data.totalFunding && (
            <motion.div key="totalFunding" initial="hidden" animate="visible" exit="exit" variants={sectionVariants}>
              <TotalFundingSection amount={data.totalFunding} />
            </motion.div>
          )}

          {visibleSections.includes("recentRound") && data.recentRound && (
            <motion.div key="recentRound" initial="hidden" animate="visible" exit="exit" variants={sectionVariants}>
              <RecentFundingSection
                type={data.recentRound.type || ''}
                amount={data.recentRound.amount || ''}
                date={data.recentRound.date || ''}
              />
            </motion.div>
          )}

          {visibleSections.includes("notableInvestors") && data.notableInvestors && (
            <motion.div
              key="notableInvestors"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={sectionVariants}
            >
              <InvestorsSection investors={data.notableInvestors} />
            </motion.div>
          )}

          {visibleSections.includes("sources") && data.sources && (
            <motion.div key="sources" initial="hidden" animate="visible" exit="exit" variants={sectionVariants}>
              <SourcesSection sources={data.sources} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
} 