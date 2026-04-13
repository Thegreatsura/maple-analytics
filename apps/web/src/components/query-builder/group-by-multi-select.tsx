import * as React from "react"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@maple/ui/components/ui/combobox"
import {
  GROUP_BY_OPTIONS,
  type QueryBuilderDataSource,
} from "@/lib/query-builder/model"

interface GroupByMultiSelectProps {
  value: string[]
  onChange: (value: string[]) => void
  dataSource: QueryBuilderDataSource
  attributeKeys?: string[]
  /** Optional placeholder shown when no chips are selected. */
  placeholder?: string
  /** Disable the picker (e.g. when scoping by an explicit service list). */
  disabled?: boolean
  /** Optional className passed to the wrapping div. */
  className?: string
}

/**
 * Multi-select combobox for choosing dashboard / alert group-by dimensions.
 * Combines the static built-in dimensions for the data source with any
 * dynamically discovered attribute keys (rendered as `attr.<key>`).
 *
 * Lifted from `dashboard-builder/config/query-panel.tsx` so the alert form
 * can reuse the exact same picker — keeping grouping semantics in sync
 * across dashboards and alerts.
 */
export function GroupByMultiSelect({
  value,
  onChange,
  dataSource,
  attributeKeys,
  placeholder = "service.name",
  disabled = false,
  className,
}: GroupByMultiSelectProps) {
  const anchor = useComboboxAnchor()

  const options = React.useMemo(() => {
    const staticOptions = GROUP_BY_OPTIONS[dataSource]
      .filter((opt) => opt.value !== "none")
      .map((opt) => ({ label: opt.label, value: opt.value }))
    const attrOptions = (attributeKeys ?? []).map((key) => ({
      label: `attr.${key}`,
      value: `attr.${key}`,
    }))
    return [...staticOptions, ...attrOptions]
  }, [dataSource, attributeKeys])

  return (
    <div className={className ?? "flex-1 min-w-[140px]"}>
      <Combobox multiple value={value} onValueChange={disabled ? () => {} : onChange}>
        <ComboboxChips ref={anchor} className="text-xs font-mono">
          {value.map((key) => (
            <ComboboxChip key={key}>{key}</ComboboxChip>
          ))}
          <ComboboxChipsInput placeholder={value.length === 0 ? placeholder : ""} />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No fields found.</ComboboxEmpty>
          <ComboboxList>
            {options.map((opt) => (
              <ComboboxItem key={opt.value} value={opt.value} className="font-mono">
                {opt.label}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}
