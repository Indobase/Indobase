import { cn } from '../../lib/utils/cn'

export const LoadingLine = ({ loading }: { loading: boolean }) => {
  return (
    <div className="relative overflow-hidden w-full h-px bg-border m-auto">
      <span
        className={cn(
          'absolute w-[80px] h-px ml-auto mr-auto left-0 right-0 text-center block top-0',
          'transition-all duration-300',
          'bg-gradient-to-r from-transparent via-[#FF9933] to-transparent shadow-[0_0_8px_1px_rgba(255,153,51,0.6)]',
          loading && 'animate-[shimmer_2s_infinite_linear]',
          loading ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          backgroundSize: '200% 100%',
        }}
      ></span>
    </div>
  )
}
