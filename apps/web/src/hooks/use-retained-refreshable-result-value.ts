import { Atom, Result } from "@/lib/effect-atom"
import * as React from "react"

import { useRefreshableAtomValue } from "@/hooks/use-refreshable-atom-value"

export function useRetainedRefreshableResultValue<A, E>(
  atom: Atom.Atom<Result.Result<A, E>>,
): Result.Result<A, E> {
  const result = useRefreshableAtomValue(atom)
  const [lastSuccess, setLastSuccess] = React.useState<Result.Success<A, E> | null>(null)

  React.useEffect(() => {
    if (Result.isSuccess(result)) {
      setLastSuccess(result)
    }
  }, [result])

  return React.useMemo(() => {
    if (Result.isInitial(result) && lastSuccess) {
      return Result.success<A, E>(lastSuccess.value, {
        waiting: true,
        timestamp: lastSuccess.timestamp,
      })
    }

    return result
  }, [lastSuccess, result])
}
