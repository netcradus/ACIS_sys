import './Select.css'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

/**
 * The real shared dropdown — every content page (Alerts, LogExplorer, Assets,
 * Correlation, ...) independently reimplemented this exact same visual
 * pattern (a "select-pill" wrapper around a native <select>) with its own
 * page-scoped CSS. One real component now, styled once in Select.css so new
 * consumers don't need their own copy.
 */
export default function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  'aria-label': ariaLabel,
}: SelectProps) {
  return (
    <div className={`ui-select-pill${className ? ` ${className}` : ''}`}>
      <select
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <span className="ui-select-pill-caret" aria-hidden="true">⌄</span>
    </div>
  )
}
