import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  ghost: 'border border-line bg-surface hover:bg-muted',
  danger: 'bg-danger text-white hover:opacity-90',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`rounded-card px-3.5 py-2 text-sm font-medium transition-hikari disabled:opacity-50 ${VARIANT[variant]} ${className}`}
    />
  )
}
